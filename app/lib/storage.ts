import type { Resource, ResourceDraft, ResourceType, StorageProvider } from "../types";
import { parseResource, serializeResource, validateResource } from "./markdown.ts";

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

async function clearHandle() {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).delete(HANDLE_KEY);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
  db.close();
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

function parseItemsEnvelope(raw: string, label: string): { name?: string; items: unknown[] } {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new Error(`${label} contains invalid JSON.`);
  }
  const items =
    typeof value === "object" &&
    value !== null &&
    "items" in value &&
    Array.isArray((value as { items: unknown }).items)
      ? (value as { items: unknown[] }).items
      : null;
  if (!items) throw new Error(`${label} must contain an items array.`);
  const name =
    typeof value === "object" && value !== null && typeof (value as { name?: unknown }).name === "string"
      ? (value as { name: string }).name
      : undefined;
  return { name, items };
}

export function parseCollectionItems(
  type: CollectionResourceType,
  raw: string,
  source: Resource["source"],
  fileModifiedMs?: number,
): Resource[] {
  const { items } = parseItemsEnvelope(raw, collectionFile(type));
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
      // New items are always appended to the end of the collection file
      // (see writeCollectionOp), so index order is creation order.
      ...(fileModifiedMs !== undefined ? { fsModifiedMs: fileModifiedMs + index } : {}),
    };
  });
}

function resourcePath(resource: ResourceDraft) {
  return isCollectionType(resource.type)
    ? `${collectionFile(resource.type)}#${resource.slug}`
    : `${folderFor(resource.type)}/${resource.slug}.md`;
}

const validResourceTypes = new Set<ResourceType>([
  "prompt",
  "skill",
  "tool",
  "book",
  "video",
  "conference",
  "training",
  "article",
  "podcast",
]);

export interface BundleParseResult {
  name?: string;
  resources: Resource[];
  skipped: { title?: string; error: string }[];
}

/**
 * Parses a shared "bundle" file: like a collection file, but items can mix any resource type
 * (each item names its own `type`). Bad items are skipped rather than failing the whole
 * bundle, since this is meant to consume a stranger's export rather than a file you maintain.
 */
export function parseBundleItems(
  raw: string,
  source: Resource["source"],
  label = "This bundle",
): BundleParseResult {
  const { name, items } = parseItemsEnvelope(raw, label);
  const resources: Resource[] = [];
  const skipped: { title?: string; error: string }[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    if (typeof item !== "object" || item === null) {
      skipped.push({ error: "Item is not a valid resource." });
      continue;
    }
    const draft = item as ResourceDraft;
    if (!validResourceTypes.has(draft.type)) {
      skipped.push({ title: draft.title, error: `“${draft.title || "Untitled"}” has an unknown type.` });
      continue;
    }
    const errors = validateResource(draft);
    if (errors.length) {
      skipped.push({ title: draft.title, error: `“${draft.title || draft.slug}”: ${errors.join(" ")}` });
      continue;
    }
    const key = `${draft.type}:${draft.slug}`;
    if (seen.has(key)) {
      skipped.push({ title: draft.title, error: `“${draft.title}” is a duplicate in this bundle.` });
      continue;
    }
    seen.add(key);
    resources.push({
      meta: draft,
      body: draft.body,
      source,
      path: resourcePath(draft),
      raw: isCollectionType(draft.type) ? `${JSON.stringify(draft, null, 2)}\n` : serializeResource(draft),
    });
  }
  if (items.length > 0 && resources.length === 0) {
    throw new Error(`${label} did not contain any valid resources.`);
  }
  return { name, resources, skipped };
}

/** Fetches a shared bundle from a URL and parses it for review in the Import flow. */
export async function fetchImportSource(url: string): Promise<ImportSource> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("Enter a valid URL.");
  }
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("Use an http or https URL.");
  }
  let response: Response;
  try {
    response = await fetch(url);
  } catch {
    throw new Error(
      "Could not reach that URL. Check the address and that the host allows cross-origin requests (CORS).",
    );
  }
  if (!response.ok) {
    throw new Error(`That URL returned an error (${response.status}).`);
  }
  const text = await response.text();
  if (new Blob([text]).size > 10_000_000) {
    throw new Error("This bundle is larger than 10 MB. Ask the sender to split it into smaller bundles.");
  }
  const { name, resources, skipped } = parseBundleItems(text, "local", "This bundle");
  return { name: name || parsed.hostname, resources, skipped };
}

/** Reads a locally-picked bundle file and parses it for review in the Import flow. */
export async function readImportFile(file: File): Promise<ImportSource> {
  if (file.size > 10_000_000) {
    throw new Error("This bundle is larger than 10 MB. Ask the sender to split it into smaller bundles.");
  }
  const text = await file.text();
  const { name, resources, skipped } = parseBundleItems(text, "local", "This bundle");
  return { name: name || file.name, resources, skipped };
}

/** Serializes selected resources into a shareable bundle file, in the same shape as a collection file. */
export function buildBundle(resources: Resource[], name?: string) {
  const items: ResourceDraft[] = resources.map((resource) => ({ ...resource.meta, body: resource.body }));
  return `${JSON.stringify({ version: 1, ...(name ? { name } : {}), items }, null, 2)}\n`;
}

export function downloadBundle(resources: Resource[], name?: string) {
  const filename = `milo-bundle-${new Date().toISOString().slice(0, 10)}.json`;
  downloadFile(buildBundle(resources, name), filename, "application/json;charset=utf-8");
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
  const file = await handle.getFile();
  const raw = await file.text();
  return parseCollectionItems(type, raw, "local", file.lastModified);
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
        const resource = parseResource(raw, `${folderFor(type)}/${entry.name}`);
        resource.fsModifiedMs = file.lastModified;
        resources.push(resource);
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
  skipped?: { title?: string; error: string }[];
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

  async disconnect() {
    this.root = null;
    await clearHandle();
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
