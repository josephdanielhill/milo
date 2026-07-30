#!/usr/bin/env node
// Writes a small, unhashed public/version.json alongside the rest of the
// static assets so a running client can poll it and notice a newer build
// has been deployed. The same id is baked into the client bundle (see
// vite.config.ts / vite.pages.config.ts) so the two can be compared.
import { execSync } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)));

function resolveBuildId() {
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA.slice(0, 8);
  try {
    return execSync("git rev-parse --short HEAD", { cwd: projectRoot }).toString().trim();
  } catch {
    return Date.now().toString(36);
  }
}

const buildId = resolveBuildId();

await writeFile(
  join(projectRoot, "public", "version.json"),
  JSON.stringify({ buildId, builtAt: new Date().toISOString() }, null, 2),
);
