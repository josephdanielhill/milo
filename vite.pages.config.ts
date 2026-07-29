import { copyFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

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
    },
  };
}

export default defineConfig({
  root: projectRoot,
  base,

  plugins: [react(), pagesFallback()],

  build: {
    outDir: "pages-dist",
    emptyOutDir: true,

    rolldownOptions: {
      input: resolve(projectRoot, "index.html"),
    },
  },
});