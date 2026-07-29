import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";

// dompurify auto-detects `window` at import time, not at call time, so a DOM
// must exist as a global before app/lib/markdown.ts (and therefore dompurify)
// is first imported. A dynamic import after setting the globals keeps this
// self-contained instead of requiring a separate --import preload file.
const { window } = new JSDOM("");
globalThis.window = window;
globalThis.document = window.document;

const {
  parseResource,
  renderMarkdown,
  serializeResource,
  slugify,
  validateResource,
} = await import("../app/lib/markdown.ts");

function basePrompt(overrides = {}) {
  return {
    title: "Test prompt",
    slug: "test-prompt",
    type: "prompt",
    summary: "A short summary.",
    author: "Jane Doe",
    tags: ["Discovery", "Research"],
    createdAt: "2026-01-01",
    updatedAt: "2026-01-02",
    body: "## Prompt\n\nDo the thing.",
    ...overrides,
  };
}

test("serializeResource -> parseResource round-trips a Markdown resource", () => {
  const draft = basePrompt();
  const raw = serializeResource(draft);
  const resource = parseResource(raw, "prompts/test-prompt.md");

  assert.equal(resource.meta.title, draft.title);
  assert.equal(resource.meta.slug, draft.slug);
  assert.equal(resource.meta.type, draft.type);
  assert.equal(resource.meta.summary, draft.summary);
  assert.equal(resource.meta.author, draft.author);
  assert.deepEqual(resource.meta.tags, draft.tags);
  assert.equal(resource.meta.createdAt, draft.createdAt);
  assert.equal(resource.meta.updatedAt, draft.updatedAt);
  assert.equal(resource.body, draft.body);
  assert.equal(resource.source, "local");
  assert.equal(resource.path, "prompts/test-prompt.md");
});

test("serializeResource -> parseResource round-trips optional fields", () => {
  const draft = basePrompt({
    type: "tool",
    toolUrl: "https://example.com/tool",
  });
  const resource = parseResource(serializeResource(draft), "tools/test-prompt.md");
  assert.equal(resource.meta.toolUrl, "https://example.com/tool");
});

test("parseResource rejects a file with no frontmatter", () => {
  assert.throws(
    () => parseResource("just a body, no frontmatter", "prompts/x.md"),
    /Missing or malformed frontmatter/,
  );
});

test("parseResource rejects a frontmatter line with no colon", () => {
  const raw = `---\ntitle nope\n---\n\nbody`;
  assert.throws(() => parseResource(raw, "prompts/x.md"), /Invalid frontmatter line/);
});

test("validateResource reports every missing required field", () => {
  const errors = validateResource({
    title: "",
    slug: "",
    type: "prompt",
    summary: "",
    author: "",
    tags: [],
    createdAt: "",
    updatedAt: "",
    body: "",
  });

  assert.match(errors.join(" "), /Add a title/);
  assert.match(errors.join(" "), /Add a filename slug/);
  assert.match(errors.join(" "), /Add a short summary/);
  assert.match(errors.join(" "), /Add an author/);
  assert.match(errors.join(" "), /Add a created date/);
  assert.match(errors.join(" "), /Add an updated date/);
  assert.match(errors.join(" "), /Add some Markdown content/);
});

test("validateResource rejects slugs with uppercase or invalid characters", () => {
  const errors = validateResource(basePrompt({ slug: "Not A Valid Slug!" }));
  assert.match(errors.join(" "), /lowercase letters, numbers, and hyphens/);
});

test("validateResource accepts a well-formed slug", () => {
  const errors = validateResource(basePrompt({ slug: "well-formed-slug-123" }));
  assert.equal(errors.filter((e) => /slug/i.test(e)).length, 0);
});

test("validateResource requires creator and toolUrl for linked resource types", () => {
  const errors = validateResource(
    basePrompt({ type: "book", creator: undefined, toolUrl: undefined }),
  );
  assert.match(errors.join(" "), /Add the book author/);
  assert.match(errors.join(" "), /Add a link to the book/);
});

test("validateResource rejects a javascript: toolUrl", () => {
  const errors = validateResource(
    basePrompt({
      type: "book",
      creator: "Some Author",
      toolUrl: "javascript:alert(document.cookie)",
    }),
  );
  assert.match(errors.join(" "), /Use a valid http or https URL/);
});

test("validateResource rejects a data: toolUrl", () => {
  const errors = validateResource(
    basePrompt({
      type: "book",
      creator: "Some Author",
      toolUrl: "data:text/html,<script>alert(1)</script>",
    }),
  );
  assert.match(errors.join(" "), /Use a valid http or https URL/);
});

test("validateResource accepts an https: toolUrl", () => {
  const errors = validateResource(
    basePrompt({ type: "book", creator: "Some Author", toolUrl: "https://example.com/book" }),
  );
  assert.equal(errors.filter((e) => /valid http or https URL/.test(e)).length, 0);
});

test("validateResource requires who attended when a conference was attended", () => {
  const errors = validateResource(
    basePrompt({
      type: "conference",
      creator: "Some Org",
      toolUrl: "https://example.com/conf",
      attended: "yes",
      whoAttended: "",
    }),
  );
  assert.match(errors.join(" "), /Add who attended the conference/);
});

test("slugify normalizes accents, case, spacing, and length", () => {
  assert.equal(slugify("Café Déjà Vu!"), "cafe-deja-vu");
  assert.equal(slugify("  leading and trailing  "), "leading-and-trailing");
  assert.equal(slugify("a".repeat(100)).length, 72);
});

test("renderMarkdown converts Markdown to sanitized HTML", () => {
  const html = renderMarkdown("# Title\n\n**bold** and _italics_.");
  assert.match(html, /<h1>Title<\/h1>/);
  assert.match(html, /<strong>bold<\/strong>/);
});

test("renderMarkdown strips a javascript: URI from a link", () => {
  const html = renderMarkdown("[click me](javascript:alert(document.cookie))");
  assert.doesNotMatch(html, /javascript:/i);
});

test("renderMarkdown keeps a safe https: link intact", () => {
  const html = renderMarkdown("[safe](https://example.com/page)");
  assert.match(html, /href="https:\/\/example\.com\/page"/);
});

test("renderMarkdown strips inline script tags and event handler attributes", () => {
  const html = renderMarkdown('<img src="x" onerror="alert(1)"><script>alert(2)</script>');
  assert.doesNotMatch(html, /onerror/i);
  assert.doesNotMatch(html, /<script/i);
});
