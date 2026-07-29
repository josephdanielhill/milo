# Architecture

See [../CLAUDE.md](../CLAUDE.md) for the quick orientation. This is the deeper
reference.

## Two build targets, one UI

`app/toolshelf-app.tsx` is the single shared React component. It's mounted by
two independent builds that never run together:

### 1. vinext / Cloudflare Workers (`vite.config.ts`)

- Uses **vinext** (`vinext()` plugin), a Vite-based framework that implements
  Next's App Router conventions on top of `@vitejs/plugin-rsc`. This is why
  `next.config.ts` and Next-shaped files exist under `app/` even though
  `next build`/`next dev` are never invoked — Next is present as a
  convention/tooling shape (routing, `eslint-config-next`, `tsconfig.json`
  `"plugins":[{"name":"next"}]`), not as the runtime.
- `app/page.tsx` and `app/[...path]/page.tsx` both render `<ToolshelfApp />`
  (the catch-all handles all in-app routes since routing is client-side, done
  by `parseRoute`/`pathFromLocation` inside `toolshelf-app.tsx`).
- Deployed via the `@cloudflare/vite-plugin`, with `worker/index.ts` as the
  Worker entry (see below). The R2 binding name comes from
  `./.openai/hosting.json`, gitignored since it's per-environment — `r2` is
  an optional binding-name string; an empty `{}` is enough while it stays
  unused (see "Known gaps" below).
- `build/sites-vite-plugin.ts` (the `sites()` plugin) runs after the build and
  copies `.openai/hosting.json` into `dist/.openai/` — packaging for whatever
  hosting/deploy tooling consumes `dist/` (`package.json`'s name was
  originally `site-creator-vinext-starter` before being renamed to `milo`,
  suggesting this template originates from an OpenAI "site creator" / Apps
  SDK starter, deploying to Cloudflare Workers).
- Output: `dist/` (`dist/client`, `dist/server`, `dist/.openai`).

### 2. Static SPA / GitHub Pages (`vite.pages.config.ts`)

- Plain `@vitejs/plugin-react` build, entry `index.html` → `pages-main.tsx`,
  which mounts the *same* `ToolshelfApp` component but computes
  `initialPath`/`basePath` from `window.location` and an optional
  `<meta name="milo-base-path">` tag (for serving under a sub-path).
  There's no server here — no Worker, no auth headers.
  Output: `pages-dist/`.
- A custom `pagesFallback()` plugin copies `index.html` to `404.html` and
  writes `.nojekyll`, so GitHub Pages serves the SPA for any deep link
  (app routes reopen correctly on refresh).
- `README.md` documents a `.github/workflows/deploy-pages.yml` that builds
  this target on every push to `main` and deploys `pages-dist/` to GitHub
  Pages — that workflow file doesn't exist in this checkout (see gaps in
  `CLAUDE.md`).

### Testing

`npm test` runs both builds and then `tests/rendered-html.test.mjs`, which
imports `dist/server/index.js` and asserts on the server-rendered HTML (title
"MILO", the `CorporateColourRail` branded UI element, and the set of known
routes: `/library`, `/prompts`, `/books`, `/videos`, `/conferences`,
`/training`, `/articles`, `/podcasts`, `/create`, `/guide`).

## The Worker (`worker/index.ts`)

Single-file Cloudflare Worker, comment-labeled "vinext-starter template".

```ts
interface Env {
  ASSETS: Fetcher;    // static asset serving
  IMAGES: { ... };      // Cloudflare Images transform binding
}
```

`fetch()` special-cases one route:

- `/_vinext/image` — proxies through `handleImageOptimization` from
  `vinext/server/image-optimization`, fetching the source via `ASSETS` and
  transforming/resizing via `IMAGES`.

Everything else falls through to `handler.fetch()` from
`vinext/server/app-router-entry`, i.e. the vinext App Router (the `app/`
directory). No KV or R2 bindings are wired into the Worker's `Env`, even
though `vite.config.ts` can configure an R2 binding from `hosting.json` — R2
isn't read anywhere in application code yet.

## Content publish pipeline

```
prompts/*.md, skills/*.md, tools/*.md, and the root *.json collections
        │
        ▼  build/generate-published-resources.mjs (runs pre dev/build/build:pages/lint)
        │
        ▼
app/generated/published-manifest.ts   (generated — do not hand-edit; regenerated every run)
        │
        ▼  app/lib/published.ts: loadPublishedResources()
        │
        ▼
merged at runtime with:
  - "example" resources — hardcoded in app/data.ts (exampleResources)
  - "local" resources — the user's connected folder, via LocalFolderStorage
```

This is how content merged to `main` becomes every deployed user's default,
read-only "published" library, layered under the seed `example` resources and
above/alongside whatever the user has in their own connected `local` folder.
The three `ResourceSource` values (`example` | `local` | `published`) are
distinguished in the UI (see `docs/DOMAIN.md`).

If you add or edit a root `*.json` collection or a `prompts/`/`skills/`/`tools/`
Markdown file, run `npm run generate:published` (or just `npm run dev`/`build`,
which do it automatically) to refresh `app/generated/published-manifest.ts`
before the change shows up in the app.

## Storage model (`app/lib/storage.ts`)

`StorageProvider` (defined in `app/types.ts`) is the interface: `connect`,
`reconnect`, `listResources`, `readResource`, `createResource`,
`updateResource`, `deleteResource`, `downloadResource`.

`LocalFolderStorage` is the only implementation, built on the browser's File
System Access API (`showDirectoryPicker`):

- On connect, ensures `prompts/`, `skills/`, `tools/` subfolders exist.
- The chosen directory handle is persisted in IndexedDB (`pm-toolshelf` DB,
  `handles` store) so the folder can be silently reconnected on a later visit
  once the browser re-grants permission (`reconnect()` / `requestStoredPermission()`).
- Markdown-type resources (`prompt`/`skill`/`tool`) are one file per resource
  under `{type}s/{slug}.md`, parsed/serialized via `app/lib/markdown.ts`.
- Collection-type resources (`book`/`video`/`conference`/`training`/`article`/`podcast`)
  live as entries inside the corresponding root JSON file
  (`{type}s.json` with a `{ version, items }` shape), addressed by path
  `"{type}s.json#{slug}"`. Writes re-read the collection file immediately
  before applying an insert/replace/remove, to reduce (not fully eliminate)
  clobbering from concurrent writers on a shared folder.
- `pickImportSource()` opens a second, independent folder **read-only** so its
  resources can be reviewed for import without touching the currently
  connected folder — backs the `/import` UI flow.

Desktop Chrome/Edge only — `supportsLocalFolders()` gates this, and the app
falls back to `example`/`published` resources elsewhere.

There is no database. The D1/Drizzle scaffold this repo started with (`db/`,
`drizzle/`, an unused `DB` binding on the Worker, `examples/d1/`) was removed
as a deliberate decision — nothing in the app used it, and MILO's actual
model is local-first (the user's folder) plus the build-time "published"
manifest, not a server-side database. If a real need for server-side storage
shows up later, `examples/d1/` in git history (pre-removal) shows the intended
opt-in pattern for wiring up a D1 table from scratch.

## Known gaps in this checkout

- `.github/workflows/deploy-pages.yml`, referenced by `README.md`, doesn't
  exist in this checkout (tracked as
  [BLD-348](https://linear.app/josephhill/issue/BLD-348)).

`.openai/hosting.json` was also missing initially — resolved by adding an
empty `{}` (gitignored; see `.gitignore` and
[BLD-347](https://linear.app/josephhill/issue/BLD-347)) since R2 isn't used
yet either. The deploy workflow gap is almost certainly an artifact that
simply wasn't copied over from the other machine, not an intentional removal.

## `app/toolshelf-app.tsx` component map

Single 2100+ line file — the whole client UI and routing. Rather than
re-reading it top to bottom, use this map to jump to the relevant function:

| Function | Role |
| --- | --- |
| `ToolshelfApp` (default export) | Top-level state: current `path`, `localResources`, folder connect status, search, toast, mobile nav — and dispatches to the views below based on `parseRoute(path)`. |
| `Sidebar` | Left nav: resource-type links, folder connect/status. |
| `Dashboard` | Home view — recent/featured resources across sources. |
| `ContributionGuide` | Renders the "how to contribute" flow (mirrors `README.md`'s PR instructions) at `/guide`. |
| `ImportPage` | `/import` — pick a second read-only folder (`pickImportSource`) and selectively bring resources into the connected folder. |
| `LibraryView` | `/library` and per-type list views — search/filter by `query`, `type`, `source`. |
| `LibraryUsageTldr` | Short usage tips shown for `prompt`/`skill` library views. |
| `ResourceGrid` | Card grid rendering for a list of resources. |
| `ResourceDetail` | Single-resource view/detail page, including delete confirmation. |
| `Editor` | Create/edit form — has `easy` (structured sections), `advanced` (raw), and `preview` panes; `bodySections`/`readStandardBody`/`writeStandardBody` define the structured-section schema per `ResourceType`. |
| `NotFound` | 404 view for unmatched routes. |
| `parseRoute` / `pathFromLocation` | Client-side router: maps a path string to a view + params. |
| `filterResources` | Shared search/filter predicate used by `LibraryView`. |
| `resourceUrl`, `routeForType`, `pluralTypeLabel`, etc. | Small formatting/label helpers keyed off `ResourceType`. |

`BrandMark` and `FolderStatusDot` are small presentational pieces used inside
`Sidebar`.

