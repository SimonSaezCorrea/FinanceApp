import swc from "unplugin-swc";
import { defineConfig } from "vitest/config";

// SWC plugin emits decorator metadata so NestJS DI works under Vitest.
export default defineConfig({
  test: {
    globals: true,
    root: "./",
    // Both suffixes: the tree grew `*.test.ts` files alongside the original
    // `*.spec.ts` ones, and a test that never runs is worse than no test.
    include: ["src/**/*.spec.ts", "test/**/*.spec.ts", "test/**/*.test.ts"],
    setupFiles: ["./test/setup-env.ts"],
  },
  plugins: [swc.vite()],
});
