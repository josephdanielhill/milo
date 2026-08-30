import { access, copyFile, mkdir, readdir, writeFile } from "node:fs/promises";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";
import { readBuildId } from "./build/read-build-id";

const projectRoot = dirname(fileURLToPath(import.meta.url));

const configuredBase = process.env.PAGES_BASE_PATH || "/";
const base = configuredBase.endsWith("/")
  ? configuredBase
  : `${configuredBase}/`;

function pagesFallback(): Plugin {
  return {
    name: "milo-pages-fallback",
    apply: "build",

    async writeBundle(options) {
      const output = options.dir
        ? resolve(projectRoot, options.dir)
        : resolve(projectRoot, "pages-dist");

      const indexFile = resolve(output, "index.html");
      const fallbackFile = resolve(output, "404.html");

      await copyFile(indexFile, fallbackFile);
      await writeFile(resolve(output, ".nojekyll"), "");

      // Copy forum bundles to pages-dist/collections/ so GitHub Pages
      // serves them at /collections/<slug>.json (matching bundleUrl
      // in forum/collections.json).
      const bundlesDir = resolve(projectRoot, "forum", "bundles");
      try {
        await access(bundlesDir);
        const collectionsDir = resolve(output, "collections");
        await mkdir(collectionsDir, { recursive: true });
        const entries = await readdir(bundlesDir, { withFileTypes: true });
        for (const entry of entries) {
          if (!entry.isFile() || extname(entry.name).toLowerCase() !== ".json") continue;
          await copyFile(
            join(bundlesDir, entry.name),
            join(collectionsDir, entry.name),
          );
        }
      } catch {
        // No forum/bundles directory — skip.
      }
    },
  };
}

export default defineConfig({
  root: projectRoot,
  base,

  define: {
    __MILO_BUILD_ID__: JSON.stringify(readBuildId(projectRoot)),
  },

  plugins: [react(), pagesFallback()],

  build: {
    outDir: "pages-dist",
    emptyOutDir: true,

    rolldownOptions: {
      input: resolve(projectRoot, "index.html"),
    },
  },
});