# Content / domain model

See [../CLAUDE.md](../CLAUDE.md) for orientation and
[ARCHITECTURE.md](ARCHITECTURE.md) for how this data is loaded and persisted.

## Core types (`app/types.ts`)

```ts
type ResourceType =
  | "prompt" | "skill" | "tool"
  | "book" | "video" | "conference" | "training" | "article" | "podcast";

type ResourceSource = "example" | "local" | "published";

interface ResourceMeta {
  title: string;
  slug: string;
  type: ResourceType;
  summary: string;
  author: string;
  tags: string[];
  createdAt: string;   // ISO date, e.g. "2026-07-28"
  updatedAt: string;
  toolUrl?: string;     // external link — required for book/video/conference/training/article/podcast
  creator?: string;      // book author, video presenter/channel, event organiser, etc.
  eventDate?: string;    // conference-specific
  location?: string;     // conference-specific
  attended?: "yes" | "no";     // conference-specific
  whoAttended?: string;         // conference-specific
  importedFrom?: string;        // set by the Import flow to the source folder/bundle name
}

interface Resource {
  meta: ResourceMeta;
  body: string;   // markdown
  source: ResourceSource;
  path: string;    // see "Path shapes" below
  raw: string;      // the literal file/entry content as it would be written
}

interface ResourceDraft extends ResourceMeta {
  body: string;   // what the Editor UI works with before it becomes a Resource
}
```

`app/lib/markdown.ts` defines `linkedResourceTypes` (book/video/conference/
training/article/podcast — all require `toolUrl`) and per-type required-field
error messages for `creator`/`toolUrl` (`validateResource`), plus
`serializeResource`/`parseResource` for the Markdown frontmatter format.

## Two storage shapes, one `ResourceType` set

- **Markdown resources** — `prompt`, `skill`, `tool`. One file per resource,
  YAML-frontmatter + Markdown body, at `{type}s/{slug}.md` (e.g.
  `prompts/research-to-opportunities.md`, `tools/leo-tool.md`). Frontmatter
  carries `title`/`slug`/`type`/`summary`/`author`/`tags`/`createdAt`/`updatedAt`
  (+ `toolUrl` for tools).
- **JSON collection resources** — `book`, `video`, `conference`, `training`,
  `article`, `podcast`. All instances of a type live as entries in one root
  JSON file: `books.json`, `videos.json`, `conferences.json`, `training.json`,
  `articles.json`, `podcasts.json`. Shape:
  ```json
  { "version": 1, "items": [ { "title": "...", "slug": "...", "type": "conference", ... } ] }
  ```
  A single item's path is addressed as `"conferences.json#future-product-days"`
  (see `LocalFolderStorage.collectionPath` in `app/lib/storage.ts`).

`app/data.ts`'s `exampleResources` builds both shapes from one list of drafts:
if the type has an entry in its internal `collectionFiles` map, it's
serialized as JSON (`isCollection = true`); otherwise it's serialized as a
Markdown resource file via `serializeResource`. This mapping mirrors the
"real" storage layer's own type routing in `app/lib/storage.ts`
(`isCollectionType`/`collectionFiles`).

## `ResourceSource` — where a resource came from, and precedence

- **`example`** — hardcoded sample content in `app/data.ts`, shown so the app
  isn't empty before a user connects a folder or any content is published.
- **`published`** — content merged to `main` (root JSON collections +
  `prompts/`/`skills/`/`tools/` Markdown), baked into
  `app/generated/published-manifest.ts` at build time. Read-only in the UI —
  every deployed instance of MILO shows the same published set.
- **`local`** — resources in the user's own connected folder
  (`LocalFolderStorage`). Editable; this is the only source the app can write
  to.

The UI (`isReadOnlySource`, `sourcePillLabel`, `sourceDetailLabel` in
`toolshelf-app.tsx`) labels resources by source and disables edit/delete for
anything that isn't `local`.

## Field notes

- `slug` is the stable identifier used in paths/URLs — must be
  `^[a-z0-9][a-z0-9-]*$` for Markdown resources (enforced in
  `LocalFolderStorage.safePath`) and match the same shape inside collection
  JSON.
- `toolUrl` doubles as "the tool's URL" for `tool` type and "the external
  link to the thing" for the six collection types — required for the latter,
  optional for `prompt`/`skill`/`tool`.
- `creator` is the human/org credited as source: book author, video
  presenter/channel, conference organiser, training provider, article
  author/publication, podcast host/show. Distinct from `author`, which is
  whoever added the resource to MILO.
- Conference-only fields: `eventDate`, `location`, `attended` (`"yes"|"no"`),
  `whoAttended` (free text, only meaningful when `attended: "yes"`).
- `importedFrom` is set automatically when a resource is brought in via the
  `/import` flow (from either a folder or a bundle URL), to that source's
  name — it's what powers the "Imported" badge shown alongside the source
  pill in the UI. Absent on resources created directly, and on anything
  written before this field existed (fully optional, so older content parses
  unchanged).
