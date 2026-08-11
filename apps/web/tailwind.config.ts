import animate from "tailwindcss-animate";
import type { Config } from "tailwindcss";

// Design tokens live as CSS variables in src/styles/index.css, so the whole
// theme (incl. dark mode) is swappable without touching component classes.
export default {
  darkMode: "class",
  // Compile every `hover:` to `@media (hover: hover)`. Without this a tap on a
  // touch device leaves the hover state applied until you tap elsewhere, which
  // read as "the button stayed selected" after closing a menu.
  future: { hoverOnlyWhenSupported: true },
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    container: {
      center: true,
      padding: "1rem",
      screens: { "2xl": "1400px" },
    },
    extend: {
      fontFamily: {
        sans: ['"Geist Variable"', '"Inter Variable"', "ui-sans-serif", "system-ui", "sans-serif"],
      },
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        brand: "hsl(var(--brand))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        success: {
          DEFAULT: "hsl(var(--success))",
          foreground: "hsl(var(--success-foreground))",
        },
        warning: {
          DEFAULT: "hsl(var(--warning))",
          foreground: "hsl(var(--warning-foreground))",
        },
        info: {
          DEFAULT: "hsl(var(--info))",
          foreground: "hsl(var(--info-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        surface2: "hsl(var(--surface-2))",
        chip: "hsl(var(--chip))",
        track: "hsl(var(--track))",
        border2: "hsl(var(--border-2))",
        dim: "hsl(var(--text-dim))",
        panel: "hsl(var(--panel-bg))",
        viewer: "hsl(var(--viewer-bg))",
        "brand-deep": "hsl(var(--brand-deep))",
        "credit-ink": "hsl(var(--credit-ink))",
        "debit-from": "hsl(var(--debit-from))",
        "debit-to": "hsl(var(--debit-to))",
        "debit-ink": "hsl(var(--debit-ink))",
        "prepaid-from": "hsl(var(--prepaid-from))",
        "prepaid-to": "hsl(var(--prepaid-to))",
        "prepaid-ink": "hsl(var(--prepaid-ink))",
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      keyframes: {
        // Indeterminate progress: a segment sweeping across its track. Used by
        // the app splash, where there's no percentage to show — only "alive".
        "progress-sweep": {
          "0%": { transform: "translateX(-100%)" },
          "100%": { transform: "translateX(300%)" },
        },
      },
      animation: {
        "progress-sweep": "progress-sweep 1.4s ease-in-out infinite",
      },
      zIndex: {
        dropdown: "1000",
        sticky: "1100",
        overlay: "1200",
        modal: "1300",
        toast: "1400",
      },
    },
  },
  plugins: [animate],
} satisfies Config;
