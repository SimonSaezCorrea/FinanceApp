import react from "@vitejs/plugin-react";
import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";

import { PRE_PAINT_SCRIPT } from "@finance/ui/prepaint.mjs";

/** The API's origin, for a `preconnect`: the session request goes there before anything renders,
 * so the connection (DNS, TCP, TLS) can open while the entry script is still downloading. */
function apiOrigin(mode: string): string | null {
  const url = loadEnv(mode, process.cwd(), "VITE_").VITE_API_URL ?? process.env.VITE_API_URL;
  try {
    return url ? new URL(url).origin : null;
  } catch {
    return null;
  }
}

export default defineConfig(({ mode }) => {
  const origin = apiOrigin(mode);
  return {
    plugins: [
      react(),
      {
        // The theme pre-paint script is shared with the public site; inline it here so the first
        // paint already has the stored theme. Also points the browser at the API early.
        name: "cuadra-index-html",
        transformIndexHtml: (html: string) =>
          html.replace(
            /<!-- theme-prepaint:[^>]*-->/,
            `<script>${PRE_PAINT_SCRIPT}</script>` +
              (origin ? `\n    <link rel="preconnect" href="${origin}" crossorigin />` : ""),
          ),
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
  };
});
