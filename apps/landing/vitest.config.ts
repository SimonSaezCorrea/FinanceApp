import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// Unit tests: the React islands and the plain scripts, in jsdom. `test/build.test.ts` runs
// separately over the built site (vitest.build.config.ts).
export default defineConfig({
  plugins: [react()],
  resolve: { dedupe: ["react", "react-dom"] },
  test: {
    globals: true,
    environment: "jsdom",
    include: ["src/**/*.test.{ts,tsx}"],
    setupFiles: ["./src/test/setup.ts"],
  },
});
