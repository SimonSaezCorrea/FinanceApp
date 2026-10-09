import { defineConfig } from "vitest/config";

// Runs over `dist/` after `astro build`: what a crawler and a first visit actually get.
export default defineConfig({
  test: { environment: "node", include: ["test/build.test.ts"] },
});
