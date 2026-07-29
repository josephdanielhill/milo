import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  // eslint-config-next's core-web-vitals and typescript sub-configs each
  // bake in their own separate `ignores: ['build/**', ...]` block, which
  // ESLint unions with the one above rather than letting it override —
  // removing "build/**" from our own list above has no effect on theirs.
  // build/ holds real hand-written source (generate-published-resources.mjs,
  // sites-vite-plugin.ts), not Next.js build output, so un-ignore it the way
  // eslint-config-next's own comments say to: a negated pattern.
  { ignores: ["!build/**"] },
]);

export default eslintConfig;
