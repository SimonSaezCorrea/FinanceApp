import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

import { PRE_PAINT_SCRIPT } from "@finance/ui/prepaint.mjs";

export default defineConfig({
  plugins: [
    react(),
    {
      // The theme pre-paint script is shared with the public site; inline it here so the first
      // paint already has the stored theme.
      name: "cuadra-theme-prepaint",
      transformIndexHtml: (html) =>
        html.replace(/<!-- theme-prepaint:[^>]*-->/, `<script>${PRE_PAINT_SCRIPT}</script>`),
    },
  ],
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
