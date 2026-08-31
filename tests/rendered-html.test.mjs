import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

async function render(pathname = "/") {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request(`http://localhost${pathname}`, {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders MILO metadata and application content", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>MILO<\/title>/i);
  assert.match(html, /better product work/i);
  assert.match(html, /CorporateColourRail|corporate-rail/);
  assert.match(html, /Your local shelf/);
  assert.match(html, /Choose folder/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape|react-loading-skeleton/i);
});

test("supports application routes through the shared app shell", async () => {
  for (const pathname of [
    "/library",
    "/prompts",
    "/books",
    "/videos",
    "/conferences",
    "/training",
    "/articles",
    "/podcasts",
    "/export",
    "/create",
    "/about",
  ]) {
    const response = await render(pathname);
    assert.equal(response.status, 200, pathname);
    const html = await response.text();
    assert.match(html, /MILO/, pathname);
    assert.doesNotMatch(html, /Starter Project/, pathname);
  }
});

test("aliases the legacy /guide route to About Milo's sharing section", async () => {
  const response = await render("/guide");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /MILO/);
});

test("keeps corporate branding fixed and local storage provider isolated", async () => {
  const [css, storage, app, packageJson] = await Promise.all([
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../app/lib/storage.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/toolshelf-app.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);

  for (const token of [
    "--brand-lime",
    "--brand-red",
    "--brand-coral",
    "--brand-blue",
    "--brand-mint",
  ]) {
    assert.match(css, new RegExp(token));
  }
  assert.match(css, /\.corporate-rail\s*\{[\s\S]*position:\s*fixed/);
  assert.match(css, /@media \(max-width:\s*900px\)/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
  assert.match(css, /\.subscription-review-modal/);
  assert.match(app, /SubscriptionReviewModal/);

  assert.match(storage, /class LocalFolderStorage implements StorageProvider/);
  assert.match(storage, /showDirectoryPicker/);
  assert.match(storage, /indexedDB\.open/);
  assert.match(storage, /prompts|skills|tools/);
  assert.match(storage, /books\.json/);
  assert.match(storage, /videos\.json/);
  assert.match(storage, /conferences\.json/);
  assert.match(storage, /training\.json/);
  assert.match(storage, /articles\.json/);
  assert.match(storage, /podcasts\.json/);
  assert.match(app, /exampleResources/);
  assert.match(app, /renderMarkdown/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);

  await assert.rejects(access(new URL("../app/_sites-preview/", import.meta.url)));
});

test("builds a GitHub Pages application artifact and deep-link fallback", async () => {
  const [index, fallback] = await Promise.all([
    readFile(new URL("../pages-dist/index.html", import.meta.url), "utf8"),
    readFile(new URL("../pages-dist/404.html", import.meta.url), "utf8"),
  ]);

  assert.match(index, /<title>MILO<\/title>/i);
  assert.match(index, /id="root"/);
  assert.equal(fallback, index);
  await access(new URL("../pages-dist/.nojekyll", import.meta.url));
});
