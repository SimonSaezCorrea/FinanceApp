import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  // Force a single React instance (pnpm can surface a second hoisted copy,
  // which breaks hooks in libs like sonner/recharts).
  resolve: { dedupe: ["react", "react-dom"] },
  server: { port: 5173 },
  test: {
    globals: true,
    environment: "jsdom",
    passWithNoTests: true,
    setupFiles: ["./src/test/setup.ts"],
    // Inline these so they resolve through Vite's React dedupe (else a 2nd React
    // copy breaks their hooks under jsdom).
    server: { deps: { inline: ["sonner", /@dnd-kit/] } },
  },
});
