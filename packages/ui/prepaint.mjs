// Plain ES module (not TypeScript) on purpose: the app's vite.config and the public site's Astro
// config import it while running in Node, before any TS transform applies to workspace packages.

/** localStorage key holding the chosen theme ("light" | "dark" | "system"); default dark. */
export const THEME_STORAGE_KEY = "finance.theme";

/**
 * Applies the stored theme to <html data-theme> and the theme-color meta BEFORE the first paint,
 * so a light-theme visitor never sees a dark flash. Mirrors ThemeProvider's resolution. Inlined
 * verbatim into each page's <head> (the app via transformIndexHtml, the public site via its layout).
 */
export const PRE_PAINT_SCRIPT = `(function () {
  try {
    var m = localStorage.getItem("${THEME_STORAGE_KEY}") || "dark";
    var resolved =
      m === "system" ? (matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark") : m;
    document.documentElement.dataset.theme = resolved;
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", resolved === "light" ? "#f4f7f8" : "#0b1518");
  } catch (e) {
    document.documentElement.dataset.theme = "dark";
  }
})();`;
