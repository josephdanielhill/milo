# MILO

MILO stands for Methods, Instructions, Learning & Operations. It is a
local-first resource hub for product managers to collect and share prompts,
skills, tools and templates, books, videos, conferences, training, articles,
and podcasts.

## Local development

Requirements:

- Node.js 22.13 or newer
- Desktop Chrome or Edge for direct local-folder access

Install and run:

```bash
npm install
npm run dev
```

The local application can create and update Markdown and JSON resources inside
a folder selected by the user. Resource content stays on the user's device.

## Validation

```bash
npm run lint
npm test
```

`npm test` validates both the application build and the static GitHub Pages
artifact.

## GitHub Pages

Every push to `main` runs `.github/workflows/deploy-pages.yml`. The workflow:

1. Installs the locked dependencies.
2. Builds the static application into `pages-dist/`.
3. Uploads that directory as the Pages artifact.
4. Deploys the artifact to the `github-pages` environment.

The generated `404.html` allows application routes to reopen correctly when
someone refreshes a resource or library page.

## Adding resources

1. Connect MILO to a folder — your own, or one kept in sync by a shared
   drive (OneDrive, Google Drive, Dropbox, etc.).
2. Create or edit the resource.
3. Anyone else connected to the same shared folder sees it once their drive
   client syncs — no branch or pull request required.
4. To share outside a shared drive, export a bundle from Share resources and
   have the recipient import it via Import → From URL.
