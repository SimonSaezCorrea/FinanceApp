import { defineConfig } from "vitest/config";

import { releaseVersions } from "./vite-plugin.mjs";

export default defineConfig({
  plugins: [releaseVersions()],
  test: { globals: true, passWithNoTests: true },
});
