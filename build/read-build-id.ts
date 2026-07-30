import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Reads the build id that build/generate-version.mjs just wrote to
// public/version.json (via the predev/prebuild npm scripts), so the value
// baked into the client bundle always matches what version.json reports.
export function readBuildId(projectRoot: string): string {
  try {
    const raw = readFileSync(resolve(projectRoot, "public", "version.json"), "utf8");
    return JSON.parse(raw).buildId;
  } catch {
    return "dev";
  }
}
