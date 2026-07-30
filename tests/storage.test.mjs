import assert from "node:assert/strict";
import test from "node:test";
import {
  LocalFolderStorage,
  buildBundle,
  collectionTypeForFile,
  parseBundleItems,
  parseCollectionItems,
} from "../app/lib/storage.ts";

// Minimal in-memory stand-in for the File System Access API's
// FileSystemDirectoryHandle/FileSystemFileHandle, just enough of the surface
// LocalFolderStorage actually calls, so its real CRUD logic (path validation,
// collection insert/replace/remove merging) can run against something other
// than a real browser folder.
class MockFileHandle {
  constructor(dir, name) {
    this.dir = dir;
    this.name = name;
  }
  async getFile() {
    const text = this.dir.files.get(this.name);
    return { text: async () => text };
  }
  async createWritable() {
    let buffer = "";
    return {
      write: async (data) => {
        buffer = data;
      },
      close: async () => {
        this.dir.files.set(this.name, buffer);
      },
    };
  }
}

class MockDirectoryHandle {
  constructor(name = "root") {
    this.name = name;
    this.dirs = new Map();
    this.files = new Map();
  }
  async getFileHandle(name, options = {}) {
    if (!this.files.has(name)) {
      if (!options.create) throw new DOMException("not found", "NotFoundError");
      this.files.set(name, "");
    }
    return new MockFileHandle(this, name);
  }
  async getDirectoryHandle(name, options = {}) {
    if (!this.dirs.has(name)) {
      if (!options.create) throw new DOMException("not found", "NotFoundError");
      this.dirs.set(name, new MockDirectoryHandle(name));
    }
    return this.dirs.get(name);
  }
  async removeEntry(name) {
    if (this.files.delete(name)) return;
    if (this.dirs.delete(name)) return;
    throw new DOMException("not found", "NotFoundError");
  }
  async *values() {
    for (const name of this.files.keys()) yield { kind: "file", name };
    for (const name of this.dirs.keys()) yield { kind: "directory", name };
  }
}

function storageWithMockRoot() {
  const storage = new LocalFolderStorage();
  // `root` is a TypeScript-private field, but that's a compile-time-only
  // restriction — at runtime it's a plain property, and there is no browser
  // showDirectoryPicker() to call in a test environment, so this is the
  // supported way to exercise the class's real public methods here.
  storage.root = new MockDirectoryHandle();
  return storage;
}

function bookDraft(overrides = {}) {
  return {
    title: "Test Book",
    slug: "test-book",
    type: "book",
    summary: "A short summary.",
    author: "Jane Doe",
    creator: "Some Author",
    tags: [],
    createdAt: "2026-01-01",
    updatedAt: "2026-01-01",
    toolUrl: "https://example.com/book",
    body: "## Why it is worth reading\n\nBecause.",
    ...overrides,
  };
}

function promptDraft(overrides = {}) {
  return {
    title: "Test Prompt",
    slug: "test-prompt",
    type: "prompt",
    summary: "A short summary.",
    author: "Jane Doe",
    tags: [],
    createdAt: "2026-01-01",
    updatedAt: "2026-01-01",
    body: "## Prompt\n\nDo the thing.",
    ...overrides,
  };
}

// -- Path validation (safePath), exercised through the public API --------

test("createResource rejects a traversal attempt in the slug", async () => {
  const storage = storageWithMockRoot();
  await assert.rejects(
    storage.createResource(promptDraft({ slug: "../../etc/passwd" })),
    /Invalid resource path/,
  );
});

test("createResource rejects an invalid slug format", async () => {
  const storage = storageWithMockRoot();
  await assert.rejects(
    storage.createResource(promptDraft({ slug: "Not Valid!" })),
    /Invalid resource path/,
  );
});

test("createResource accepts a well-formed slug and round-trips it", async () => {
  const storage = storageWithMockRoot();
  const created = await storage.createResource(promptDraft());
  assert.equal(created.path, "prompts/test-prompt.md");

  const read = await storage.readResource("prompts/test-prompt.md");
  assert.equal(read.meta.title, "Test Prompt");
});

test("createResource refuses to overwrite an existing Markdown file", async () => {
  const storage = storageWithMockRoot();
  await storage.createResource(promptDraft());
  await assert.rejects(storage.createResource(promptDraft()), /already exists/);
});

// -- Collection insert/replace/remove (writeCollectionOp) -----------------

test("createResource inserts a new item into an empty collection file", async () => {
  const storage = storageWithMockRoot();
  const created = await storage.createResource(bookDraft());
  assert.equal(created.path, "books.json#test-book");

  const raw = storage.root.files.get("books.json");
  const parsed = JSON.parse(raw);
  assert.equal(parsed.items.length, 1);
  assert.equal(parsed.items[0].slug, "test-book");
});

test("createResource rejects a duplicate slug in a collection", async () => {
  const storage = storageWithMockRoot();
  await storage.createResource(bookDraft());
  await assert.rejects(storage.createResource(bookDraft()), /already exists/);
});

test("updateResource replaces an existing collection item in place", async () => {
  const storage = storageWithMockRoot();
  await storage.createResource(bookDraft());
  await storage.updateResource(
    "books.json#test-book",
    bookDraft({ summary: "An updated summary." }),
  );

  const parsed = JSON.parse(storage.root.files.get("books.json"));
  assert.equal(parsed.items.length, 1);
  assert.equal(parsed.items[0].summary, "An updated summary.");
});

test("deleteResource removes a collection item", async () => {
  const storage = storageWithMockRoot();
  await storage.createResource(bookDraft());
  await storage.deleteResource("books.json#test-book");

  const parsed = JSON.parse(storage.root.files.get("books.json"));
  assert.equal(parsed.items.length, 0);
});

test("deleteResource on a missing collection item throws", async () => {
  const storage = storageWithMockRoot();
  await storage.createResource(bookDraft());
  await assert.rejects(storage.deleteResource("books.json#no-such-slug"), /not found/i);
});

test("createResource keeps unrelated collection items untouched", async () => {
  const storage = storageWithMockRoot();
  await storage.createResource(bookDraft({ slug: "book-one" }));
  await storage.createResource(bookDraft({ slug: "book-two" }));

  const parsed = JSON.parse(storage.root.files.get("books.json"));
  assert.deepEqual(
    parsed.items.map((item) => item.slug).sort(),
    ["book-one", "book-two"],
  );
});

// -- Favourites (per-identity file under .milo/favourites/) -----------------

test("getFavourites returns an empty list when nothing has been saved yet", async () => {
  const storage = storageWithMockRoot();
  assert.deepEqual(await storage.getFavourites("swift-otter"), []);
});

test("saveFavourites then getFavourites round-trips the same identity's items", async () => {
  const storage = storageWithMockRoot();
  await storage.saveFavourites("swift-otter", ["prompt:test-prompt", "book:test-book"]);
  assert.deepEqual(await storage.getFavourites("swift-otter"), [
    "prompt:test-prompt",
    "book:test-book",
  ]);
});

test("favourites are written under .milo/favourites/<identity>.json", async () => {
  const storage = storageWithMockRoot();
  await storage.saveFavourites("swift-otter", ["prompt:test-prompt"]);
  const milo = storage.root.dirs.get(".milo");
  const favouritesDir = milo.dirs.get("favourites");
  const raw = favouritesDir.files.get("swift-otter.json");
  assert.deepEqual(JSON.parse(raw), { version: 1, items: ["prompt:test-prompt"] });
});

test("saveFavourites for one identity does not affect another identity's file", async () => {
  const storage = storageWithMockRoot();
  await storage.saveFavourites("swift-otter", ["prompt:test-prompt"]);
  await storage.saveFavourites("keen-heron", ["book:test-book"]);
  assert.deepEqual(await storage.getFavourites("swift-otter"), ["prompt:test-prompt"]);
  assert.deepEqual(await storage.getFavourites("keen-heron"), ["book:test-book"]);
});

test("saveFavourites overwrites a previous save for the same identity", async () => {
  const storage = storageWithMockRoot();
  await storage.saveFavourites("swift-otter", ["prompt:test-prompt"]);
  await storage.saveFavourites("swift-otter", ["prompt:test-prompt", "book:test-book"]);
  assert.deepEqual(await storage.getFavourites("swift-otter"), [
    "prompt:test-prompt",
    "book:test-book",
  ]);
});

test("favourites survive a disconnect + reconnect to the same underlying folder", async () => {
  // Disconnecting just drops the app's in-memory handle (LocalFolderStorage.root = null);
  // it never touches disk. Reconnecting hands back a *new* directory handle object, but one
  // backed by the same on-disk tree — modelled here by pointing a second storage instance at
  // the exact same MockDirectoryHandle rather than a fresh one.
  const root = new MockDirectoryHandle();
  const before = new LocalFolderStorage();
  before.root = root;
  await before.saveFavourites("swift-otter", ["prompt:test-prompt"]);

  before.root = null; // simulate disconnectFolder()

  const after = new LocalFolderStorage();
  after.root = root; // simulate re-picking the same physical folder
  assert.deepEqual(await after.getFavourites("swift-otter"), ["prompt:test-prompt"]);
});

test("listFavouriteIdentities returns an empty list before anyone has favourited anything", async () => {
  const storage = storageWithMockRoot();
  assert.deepEqual(await storage.listFavouriteIdentities(), []);
});

test("listFavouriteIdentities lists every identity that has saved favourites", async () => {
  const storage = storageWithMockRoot();
  await storage.saveFavourites("swift-otter", ["prompt:test-prompt"]);
  await storage.saveFavourites("keen-heron", ["book:test-book"]);
  assert.deepEqual(new Set(await storage.listFavouriteIdentities()), new Set(["swift-otter", "keen-heron"]));
});

test("a browser that lost its stored identity can recover the sole existing identity's favourites", async () => {
  // Models clearing cookies/site data: localStorage (and so the remembered identity) is wiped,
  // but the folder on disk — and the favourites file already saved there — is untouched. A
  // fresh browser picking the same folder should be able to find that one orphaned identity.
  const root = new MockDirectoryHandle();
  const before = new LocalFolderStorage();
  before.root = root;
  await before.saveFavourites("swift-otter", ["prompt:test-prompt", "book:test-book"]);

  const after = new LocalFolderStorage();
  after.root = root;
  const newBrowserIdentity = "keen-heron"; // freshly generated, has no file of its own yet
  assert.deepEqual(await after.getFavourites(newBrowserIdentity), []);
  const existing = await after.listFavouriteIdentities();
  assert.deepEqual(existing, ["swift-otter"]);
  assert.deepEqual(await after.getFavourites(existing[0]), ["prompt:test-prompt", "book:test-book"]);
});

test("listFavouriteIdentities does not pick a winner when multiple identities exist", async () => {
  const root = new MockDirectoryHandle();
  const storage = new LocalFolderStorage();
  storage.root = root;
  await storage.saveFavourites("swift-otter", ["prompt:test-prompt"]);
  await storage.saveFavourites("keen-heron", ["book:test-book"]);
  const existing = await storage.listFavouriteIdentities();
  assert.equal(existing.length, 2);
});

test("getFavourites propagates an unexpected error instead of treating it as \"no favourites\"", async () => {
  const storage = storageWithMockRoot();
  const originalGetDirectoryHandle = storage.root.getDirectoryHandle.bind(storage.root);
  storage.root.getDirectoryHandle = async (name, options) => {
    if (name === ".milo") throw new DOMException("permission revoked", "NotAllowedError");
    return originalGetDirectoryHandle(name, options);
  };
  await assert.rejects(storage.getFavourites("swift-otter"), (error) => {
    assert.ok(error instanceof DOMException);
    assert.equal(error.name, "NotAllowedError");
    return true;
  });
});

// -- Pure helper exports ----------------------------------------------------

test("collectionTypeForFile maps known collection filenames", () => {
  assert.equal(collectionTypeForFile("books.json"), "book");
  assert.equal(collectionTypeForFile("podcasts.json"), "podcast");
  assert.equal(collectionTypeForFile("unknown.json"), undefined);
});

test("parseCollectionItems parses a valid collection file", () => {
  const raw = JSON.stringify({ version: 1, items: [bookDraft()] });
  const resources = parseCollectionItems("book", raw, "published");
  assert.equal(resources.length, 1);
  assert.equal(resources[0].path, "books.json#test-book");
  assert.equal(resources[0].source, "published");
});

test("parseCollectionItems rejects invalid JSON", () => {
  assert.throws(() => parseCollectionItems("book", "{ not json", "local"), /invalid JSON/);
});

test("parseCollectionItems rejects a file without an items array", () => {
  assert.throws(
    () => parseCollectionItems("book", JSON.stringify({ version: 1 }), "local"),
    /must contain an items array/,
  );
});

test("parseCollectionItems surfaces validation errors for a bad item", () => {
  const raw = JSON.stringify({ version: 1, items: [bookDraft({ title: "" })] });
  assert.throws(() => parseCollectionItems("book", raw, "local"), /item 1/);
});

// -- parseBundleItems / buildBundle (URL-shared bundles) --------------------

test("parseBundleItems parses a valid mixed-type bundle", () => {
  const raw = JSON.stringify({
    version: 1,
    name: "Starter pack",
    items: [bookDraft(), promptDraft()],
  });
  const { name, resources, skipped } = parseBundleItems(raw, "local");
  assert.equal(name, "Starter pack");
  assert.equal(skipped.length, 0);
  assert.equal(resources.length, 2);
  const book = resources.find((r) => r.meta.type === "book");
  const prompt = resources.find((r) => r.meta.type === "prompt");
  assert.equal(book.path, "books.json#test-book");
  assert.equal(prompt.path, "prompts/test-prompt.md");
  // Markdown-backed types must serialize like they would on disk, not as JSON,
  // so the Import dedup check (comparing .raw) can match an already-local copy.
  assert.match(prompt.raw, /^---\ntitle: "Test Prompt"/);
});

test("parseBundleItems rejects invalid JSON", () => {
  assert.throws(() => parseBundleItems("{ not json", "local"), /invalid JSON/);
});

test("parseBundleItems rejects a bundle without an items array", () => {
  assert.throws(
    () => parseBundleItems(JSON.stringify({ version: 1 }), "local"),
    /must contain an items array/,
  );
});

test("parseBundleItems skips a bad item but keeps the good ones", () => {
  const raw = JSON.stringify({
    version: 1,
    items: [bookDraft({ title: "" }), promptDraft()],
  });
  const { resources, skipped } = parseBundleItems(raw, "local");
  assert.equal(resources.length, 1);
  assert.equal(resources[0].meta.type, "prompt");
  assert.equal(skipped.length, 1);
});

test("parseBundleItems skips a duplicate slug within the same bundle", () => {
  const raw = JSON.stringify({
    version: 1,
    items: [promptDraft(), promptDraft({ title: "Second copy" })],
  });
  const { resources, skipped } = parseBundleItems(raw, "local");
  assert.equal(resources.length, 1);
  assert.equal(resources[0].meta.title, "Test Prompt");
  assert.equal(skipped.length, 1);
  assert.match(skipped[0].error, /duplicate/);
});

test("parseBundleItems throws when every item is invalid", () => {
  const raw = JSON.stringify({ version: 1, items: [bookDraft({ title: "" })] });
  assert.throws(() => parseBundleItems(raw, "local"), /did not contain any valid resources/);
});

test("parseBundleItems accepts an empty bundle", () => {
  const raw = JSON.stringify({ version: 1, items: [] });
  const { resources, skipped } = parseBundleItems(raw, "local");
  assert.equal(resources.length, 0);
  assert.equal(skipped.length, 0);
});

test("buildBundle output round-trips through parseBundleItems", () => {
  const resources = [
    { meta: bookDraft(), body: bookDraft().body },
    { meta: promptDraft(), body: promptDraft().body },
  ];
  const raw = buildBundle(resources, "My export");
  const { name, resources: parsed, skipped } = parseBundleItems(raw, "local");
  assert.equal(name, "My export");
  assert.equal(skipped.length, 0);
  assert.deepEqual(
    parsed.map((r) => r.meta.slug).sort(),
    ["test-book", "test-prompt"],
  );
});
