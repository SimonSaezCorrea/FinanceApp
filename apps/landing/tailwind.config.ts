import type { Config } from "tailwindcss";

import preset from "@finance/ui/tailwind-preset";

// The theme comes from the shared preset (one source with the app, FR-008); this site adds where
// its classes live — its pages and components, and the shared components it renders.
export default {
  presets: [preset],
  content: ["./src/**/*.{astro,ts,tsx}", "../../packages/ui/src/**/*.{ts,tsx}"],
} satisfies Config;
