import type { Resource, ResourceDraft, ResourceType, StorageProvider } from "../types";
import { parseResource, serializeResource, validateResource } from "./markdown";

const DB_NAME = "pm-toolshelf";
const STORE_NAME = "handles";
const HANDLE_KEY = "local-library";

type PermissionMode = "read" | "readwrite";
type FileSystemPermissionDescriptor = { mode?: PermissionMode };

interface DirectoryHandle extends FileSystemDirectoryHandle {
  values(): AsyncIterableIterator<FileSystemFileHandle | DirectoryHandle>;
  queryPermission(descriptor?: FileSystemPermissionDescriptor): Promise<PermissionState>;
  requestPermission(descriptor?: FileSystemPermissionDescriptor): Promise<PermissionState>;
}

interface PickerWindow extends Window {
  showDirectoryPicker(options?: { mode?: PermissionMode }): Promise<DirectoryHandle>;
}

function openDb() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function saveHandle(handle: DirectoryHandle) {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).put(handle, HANDLE_KEY);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
  db.close();
}

async function loadHandle() {
  const db = await openDb();
  const handle = await new Promise<DirectoryHandle | null>((resolve, reject) => {
    const request = db.transaction(STORE_NAME).objectStore(STORE_NAME).get(HANDLE_KEY);
    request.onsuccess = () => resolve((request.result as DirectoryHandle) || null);
    request.onerror = () => reject(request.error);
  });
  db.close();
  return handle;
}

function folderFor(type: ResourceType) {
  return `${type}s`;
}

type CollectionResourceType =
  | "book"
  | "video"
  | "conference"
  | "training"
  | "article"
  | "podcast";

const collectionTypes: CollectionResourceType[] = [
  "book",
  "video",
  "conference",
  "training",
  "article",
  "podcast",
];

const collectionFiles: Record<CollectionResourceType, string> = {
  book: "books.json",
  video: "videos.json",
  conference: "conferences.json",
  training: "training.json",
  article: "articles.json",
  podcast: "podcasts.json",
};

const collectionTypesByFile = Object.fromEntries(
  collectionTypes.map((type) => [collectionFiles[type], type]),
) as Record<string, CollectionResourceType>;

export function collectionTypeForFile(filename: string) {
  return collectionTypesByFile[filename];
}

function isCollectionType(type: ResourceType): type is CollectionResourceType {
  return collectionTypes.includes(type as CollectionResourceType);
}

function collectionFile(type: CollectionResourceType) {
  return collectionFiles[type];
}

export function parseCollectionItems(
  type: CollectionResourceType,
  raw: string,
  source: Resource["source"],
): Resource[] {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new Error(`${collectionFile(type)} contains invalid JSON.`);
  }
  const items =
    typeof value === "object" &&
    value !== null &&
    "items" in value &&
    Array.isArray((value as { items: unknown }).items)
      ? (value as { items: unknown[] }).items
      : null;
  if (!items) throw new Error(`${collectionFile(type)} must contain an items array.`);
  return items.map((item, index) => {
    if (typeof item !== "object" || item === null) {
      throw new Error(`${collectionFile(type)} item ${index + 1} is invalid.`);
    }
    const draft = { ...(item as ResourceDraft), type };
    const errors = validateResource(draft);
    if (errors.length) {
      throw new Error(`${collectionFile(type)} item ${index + 1}: ${errors.join(" ")}`);
    }
    return {
      meta: draft,
      body: draft.body,
      source,
      path: `${collectionFile(type)}#${draft.slug}`,
      raw: `${JSON.stringify(draft, null, 2)}\n`,
    };
  });
}

function resourcePath(resource: ResourceDraft) {
  return isCollectionType(resource.type)
    ? `${collectionFile(resource.type)}#${resource.slug}`
    : `${folderFor(resource.type)}/${resource.slug}.md`;
}

export function supportsLocalFolders() {
  return typeof window !== "undefined" && "showDirectoryPicker" in window;
}

async function readCollectionFrom(
  root: DirectoryHandle,
  type: CollectionResourceType,
): Promise<Resource[]> {
  let handle: FileSystemFileHandle;
  try {
    handle = await root.getFileHandle(collectionFile(type));
  } catch (error) {
    if (error instanceof DOMException && error.name === "NotFoundError") return [];
    throw error;
  }
  const raw = await (await handle.getFile()).text();
  return parseCollectionItems(type, raw, "local");
}

async function listResourcesFrom(
  root: DirectoryHandle,
  options: { createMissing?: boolean } = {},
): Promise<Resource[]> {
  const createMissing = options.createMissing ?? true;
  const resources: Resource[] = [];
  for (const type of ["prompt", "skill", "tool"] as ResourceType[]) {
    let folder: DirectoryHandle;
    try {
      folder = (await root.getDirectoryHandle(folderFor(type), {
        create: createMissing,
      })) as DirectoryHandle;
    } catch (error) {
      if (
        error instanceof DOMException &&
        (error.name === "NotFoundError" || error.name === "NotAllowedError")
      ) {
        continue;
      }
      throw error;
    }
    for await (const entry of folder.values()) {
      if (entry.kind !== "file" || !entry.name.toLowerCase().endsWith(".md")) continue;
      try {
        const file = await entry.getFile();
        const raw = await file.text();
        resources.push(parseResource(raw, `${folderFor(type)}/${entry.name}`));
      } catch (error) {
        console.warn(`Skipped ${entry.name}:`, error);
      }
    }
  }
  for (const type of collectionTypes) {
    resources.push(...(await readCollectionFrom(root, type)));
  }
  return resources.sort((a, b) => b.meta.updatedAt.localeCompare(a.meta.updatedAt));
}

export interface ImportSource {
  name: string;
  resources: Resource[];
}

/** Opens a second, independent folder read-only so its resources can be reviewed for import without disturbing the currently-connected folder. */
export async function pickImportSource(): Promise<ImportSource> {
  if (!supportsLocalFolders()) {
    throw new Error("Direct folder access requires desktop Chrome or Edge.");
  }
  const root = await (window as unknown as PickerWindow).showDirectoryPicker({ mode: "read" });
  const resources = await listResourcesFrom(root, { createMissing: false });
  return { name: root.name, resources };
}

type CollectionOp =
  | { kind: "insert"; item: ResourceDraft }
  | { kind: "replace"; item: ResourceDraft }
  | { kind: "remove"; slug: string };

export class LocalFolderStorage implements StorageProvider {
  private root: DirectoryHandle | null = null;

  get folderName() {
    return this.root?.name || null;
  }

  async connect() {
    if (!supportsLocalFolders()) {
      throw new Error("Direct folder access requires desktop Chrome or Edge.");
    }
    this.root = await (window as unknown as PickerWindow).showDirectoryPicker({
      mode: "readwrite",
    });
    for (const type of ["prompt", "skill", "tool"] as ResourceType[]) {
      await this.root.getDirectoryHandle(folderFor(type), { create: true });
    }
    await saveHandle(this.root);
    return this.root.name;
  }

  async reconnect() {
    const handle = await loadHandle();
    if (!handle) return null;
    this.root = handle;
    const permission = await handle.queryPermission({ mode: "readwrite" });
    return permission === "granted" ? handle.name : null;
  }

  async requestStoredPermission() {
    if (!this.root) this.root = await loadHandle();
    if (!this.root) return null;
    const permission = await this.root.requestPermission({ mode: "readwrite" });
    return permission === "granted" ? this.root.name : null;
  }

  async listResources() {
    return listResourcesFrom(this.requireRoot());
  }

  async readResource(path: string) {
    const collection = this.collectionPath(path);
    if (collection) {
      const resource = (await this.readCollection(collection.type)).find(
        (item) => item.meta.slug === collection.slug,
      );
      if (!resource) throw new Error(`Could not find ${collection.slug} in ${collectionFile(collection.type)}.`);
      return resource;
    }
    const [folderName, fileName] = this.safePath(path);
    const folder = await this.requireRoot().getDirectoryHandle(folderName);
    const file = await (await folder.getFileHandle(fileName)).getFile();
    return parseResource(await file.text(), path);
  }

  async createResource(resource: ResourceDraft) {
    const path = resourcePath(resource);
    if (isCollectionType(resource.type)) {
      await this.writeCollectionOp(resource.type, { kind: "insert", item: resource });
      return this.readResource(path);
    }
    const [folderName, fileName] = this.safePath(path);
    const folder = await this.requireRoot().getDirectoryHandle(folderName, { create: true });
    try {
      await folder.getFileHandle(fileName);
      throw new Error(`A file named ${fileName} already exists.`);
    } catch (error) {
      if (error instanceof Error && error.message.includes("already exists")) throw error;
    }
    await this.write(folder, fileName, serializeResource(resource));
    return this.readResource(path);
  }

  async updateResource(path: string, resource: ResourceDraft) {
    const nextPath = resourcePath(resource);
    if (path !== nextPath) {
      const created = await this.createResource(resource);
      await this.deleteResource(path);
      return created;
    }
    if (isCollectionType(resource.type)) {
      await this.writeCollectionOp(resource.type, { kind: "replace", item: resource });
      return this.readResource(path);
    }
    const [oldFolder, oldFile] = this.safePath(path);
    const folder = await this.requireRoot().getDirectoryHandle(oldFolder);
    await this.write(folder, oldFile, serializeResource(resource));
    return this.readResource(nextPath);
  }

  async deleteResource(path: string) {
    const collection = this.collectionPath(path);
    if (collection) {
      await this.writeCollectionOp(collection.type, { kind: "remove", slug: collection.slug });
      return;
    }
    const [folderName, fileName] = this.safePath(path);
    await (await this.requireRoot().getDirectoryHandle(folderName)).removeEntry(fileName);
  }

  async downloadResource(path: string) {
    const resource = await this.readResource(path);
    const json = isCollectionType(resource.meta.type);
    downloadFile(
      resource.raw,
      `${resource.meta.slug}.${json ? "json" : "md"}`,
      json ? "application/json;charset=utf-8" : "text/markdown;charset=utf-8",
    );
  }

  private requireRoot() {
    if (!this.root) throw new Error("Choose a local folder first.");
    return this.root;
  }

  private safePath(path: string) {
    const parts = path.split("/");
    if (
      parts.length !== 2 ||
      !["prompts", "skills", "tools"].includes(parts[0]) ||
      !/^[a-z0-9][a-z0-9-]*\.md$/.test(parts[1])
    ) {
      throw new Error("Invalid resource path.");
    }
    return parts as [string, string];
  }

  private collectionPath(path: string) {
    const match = path.match(
      /^(books|videos|conferences|training|articles|podcasts)\.json#([a-z0-9][a-z0-9-]*)$/,
    );
    if (!match) return null;
    const typesByFile: Record<string, CollectionResourceType> = {
      books: "book",
      videos: "video",
      conferences: "conference",
      training: "training",
      articles: "article",
      podcasts: "podcast",
    };
    return {
      type: typesByFile[match[1]],
      slug: match[2],
    };
  }

  private async readCollection(type: CollectionResourceType): Promise<Resource[]> {
    return readCollectionFrom(this.requireRoot(), type);
  }

  /**
   * Re-reads the collection file immediately before writing and applies `op` to that fresh
   * copy, rather than to whatever was read whenever the caller's form was opened. This keeps
   * concurrent edits from different writers (e.g. a shared folder) from clobbering each
   * other's additions. Only two edits to the exact same slug at the same instant can still
   * collide, which resolves last-write-wins.
   */
  private async writeCollectionOp(type: CollectionResourceType, op: CollectionOp) {
    const current = await this.readCollection(type);
    const drafts = current.map((item) => ({ ...item.meta, body: item.body }));
    let next: ResourceDraft[];
    if (op.kind === "insert") {
      if (drafts.some((item) => item.slug === op.item.slug)) {
        throw new Error(`An item with the slug ${op.item.slug} already exists.`);
      }
      next = [...drafts, op.item];
    } else if (op.kind === "replace") {
      const index = drafts.findIndex((item) => item.slug === op.item.slug);
      if (index < 0) {
        throw new Error(`Could not find ${op.item.slug} in ${collectionFile(type)}.`);
      }
      next = drafts.map((item, i) => (i === index ? op.item : item));
    } else {
      next = drafts.filter((item) => item.slug !== op.slug);
      if (next.length === drafts.length) throw new Error("Resource not found.");
    }
    const handle = await this.requireRoot().getFileHandle(collectionFile(type), { create: true });
    const writable = await handle.createWritable();
    await writable.write(`${JSON.stringify({ version: 1, items: next }, null, 2)}\n`);
    await writable.close();
  }

  private async write(folder: FileSystemDirectoryHandle, name: string, raw: string) {
    const handle = await folder.getFileHandle(name, { create: true });
    const writable = await handle.createWritable();
    await writable.write(raw);
    await writable.close();
  }
}

export function downloadMarkdown(raw: string, filename: string) {
  downloadFile(raw, filename, "text/markdown;charset=utf-8");
}

export function downloadFile(raw: string, filename: string, mimeType: string) {
  const url = URL.createObjectURL(new Blob([raw], { type: mimeType }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
