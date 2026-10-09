import type { Config } from "tailwindcss";

import preset from "@finance/ui/tailwind-preset";

// The theme (tokens, dark mode, breakpoints meaning) comes from the shared preset; this app adds
// where its classes live — including the shared components it renders.
export default {
  presets: [preset],
  content: ["./index.html", "./src/**/*.{ts,tsx}", "../../packages/ui/src/**/*.{ts,tsx}"],
} satisfies Config;
