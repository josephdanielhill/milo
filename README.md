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

## Contributing resources

Use a branch and pull request:

1. Update your local `main`.
2. Create a clearly named branch.
3. Connect MILO to the repository folder.
4. Create or edit the resource.
5. Commit the changed Markdown or JSON file in GitHub Desktop.
6. Open a pull request targeting `main`.
