# MILO

MILO ("Methods, Instructions, Learning & Operations") is a local-first resource
hub for product managers: prompts, skills, tools, books, videos, conferences,
training, articles, and podcasts. Content lives as Markdown/JSON files that
users edit directly in a folder on their own machine (via the File System
Access API) or contribute upstream via PR. See [README.md](README.md) for the
end-user pitch and contribution flow.

For deeper detail, see:
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — build targets, the Worker, the publish pipeline, storage
- [docs/DOMAIN.md](docs/DOMAIN.md) — the resource/content data model

## Two apps in one repo

There is one shared UI component, `app/toolshelf-app.tsx`, mounted by **two
separate builds**:

1. **vinext / Cloudflare Workers** (`vite.config.ts` → `dist/`) — the real
   full-stack app, server-rendered via a Cloudflare Worker (`worker/index.ts`)
   with D1/R2/Images bindings. `next.config.ts` and the `app/` router-file
   layout exist only because **vinext** mimics Next's App Router conventions
   (`@vitejs/plugin-rsc`) — `next build`/`next dev` are never actually run.
2. **Static SPA / GitHub Pages** (`vite.pages.config.ts` → `pages-dist/`) — a
   plain Vite+React build of the same component, entered via `pages-main.tsx`
   and `index.html`, for a no-backend deployment.

`build/` is not a build-output directory despite the name — it holds
hand-written build-support scripts (`generate-published-resources.mjs`,
`sites-vite-plugin.ts`) imported by the configs above.

## Commands

```bash
npm run dev          # vinext dev server (Cloudflare Workers target)
npm run build         # vinext build -> dist/
npm run build:pages   # static SPA build -> pages-dist/
npm test              # build + build:pages, then tests/rendered-html.test.mjs against dist/
npm run lint           # eslint
npm run db:generate    # drizzle-kit generate (schema is currently empty, see below)
```

`generate:published` runs automatically before `dev`/`build`/`build:pages`/`lint`
(see Content pipeline below) — you shouldn't need to run it by hand.

Requires Node.js >= 22.13 and, for local-folder connect, desktop Chrome or Edge.

## Content pipeline (quick version)

Root-level JSON collections (`books.json`, `videos.json`, `conferences.json`,
`training.json`, `articles.json`, `podcasts.json`) and Markdown files in
`prompts/`, `skills/`, `tools/` are the actual committed content. A prebuild
script bundles them into `app/generated/published-manifest.ts` (generated,
do not hand-edit — see [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)), which is how
content merged to `main` becomes every user's default "published" library.

## Known gaps in this checkout

This repo was copied from another machine without git history, so a couple of
things referenced by the config/README weren't present here yet:

- `vite.config.ts` imports `./.openai/hosting.json` for D1/R2 binding names.
  It's intentionally gitignored (per-environment, not shared across
  machines/deploys) — a fresh clone needs one to exist for `npm run dev`/
  `build` to even start. `d1`/`r2` are optional binding-name strings (see
  `db/index.ts`'s error message); since D1/R2 aren't used by the app yet, an
  empty `{}` is sufficient and is what's in this checkout now.
- `README.md` describes a `.github/workflows/deploy-pages.yml` GitHub Pages
  deploy workflow; the `.github/` directory still doesn't exist here
  (tracked as [BLD-348](https://linear.app/josephhill/issue/BLD-348)).

## Data model

See [docs/DOMAIN.md](docs/DOMAIN.md) for `ResourceType`/`ResourceMeta`/`Resource`
and how Markdown-file resources differ from JSON-collection resources.
