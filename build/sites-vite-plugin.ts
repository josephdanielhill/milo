import { access, cp, mkdir, readdir, rm } from "node:fs/promises";
import { extname, join, resolve } from "node:path";
import type { Plugin } from "vite";

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

// Packages Sites metadata after Vite finishes compiling.
export function sites(): Plugin {
  let root = process.cwd();

  return {
    name: "sites",
    apply: "build",
    configResolved(config) {
      root = config.root;
    },
    async closeBundle() {
      const outputDirectory = resolve(root, "dist", ".openai");
      const hostingConfig = resolve(root, ".openai", "hosting.json");

      await rm(outputDirectory, { recursive: true, force: true });
      await mkdir(outputDirectory, { recursive: true });

      if (await exists(hostingConfig)) {
        await cp(hostingConfig, resolve(outputDirectory, "hosting.json"));
      }

      // Copy forum bundles to dist/client/collections/ so they're served
      // as static assets at /collections/<slug>.json (matching bundleUrl
      // in forum/collections.json). The app fetches these URLs when a user
      // subscribes to a collection via the MILO forum/Discover page.
      const bundlesDir = resolve(root, "forum", "bundles");
      if (await exists(bundlesDir)) {
        const collectionsDir = resolve(root, "dist", "client", "collections");
        await mkdir(collectionsDir, { recursive: true });
        const entries = await readdir(bundlesDir, { withFileTypes: true });
        for (const entry of entries) {
          if (!entry.isFile() || extname(entry.name).toLowerCase() !== ".json") continue;
          // Read the bundle file to extract its slug — use the filename
          // minus extension as the slug (e.g. b2b-product-manager.json → b2b-product-manager.json)
          await cp(
            join(bundlesDir, entry.name),
            join(collectionsDir, entry.name),
            { force: true }
          );
        }
      }
    },
  };
}
