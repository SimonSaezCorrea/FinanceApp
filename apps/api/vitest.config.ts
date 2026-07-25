import swc from "unplugin-swc";
import { defineConfig } from "vitest/config";

// SWC plugin emits decorator metadata so NestJS DI works under Vitest.
export default defineConfig({
  test: {
    globals: true,
    root: "./",
    include: ["src/**/*.spec.ts", "test/**/*.spec.ts"],
  },
  plugins: [swc.vite()],
});
