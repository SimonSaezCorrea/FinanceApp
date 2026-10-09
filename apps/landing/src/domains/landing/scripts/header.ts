import { THEME_STORAGE_KEY } from "@finance/ui/prepaint.mjs";

/**
 * The few things a public page does on its own, in plain script (no React on arrival, spec 031
 * R7): the theme switch, the phone menu, the header's height for whatever sticks below it, and
 * opening the FAQ question an address points at (`/es/faq/#faq-minors`).
 */

type ThemeMode = "light" | "dark" | "system";
const MODES: readonly ThemeMode[] = ["light", "dark", "system"];

function storedMode(): ThemeMode {
  try {
    const value = localStorage.getItem(THEME_STORAGE_KEY);
    return MODES.includes(value as ThemeMode) ? (value as ThemeMode) : "dark";
  } catch {
    return "dark";
  }
}

function resolve(mode: ThemeMode): "light" | "dark" {
  if (mode !== "system") return mode;
  return matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

/** Same resolution as the app's ThemeProvider and the pre-paint script. */
export function applyTheme(mode: ThemeMode): void {
  const resolved = resolve(mode);
  document.documentElement.dataset.theme = resolved;
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", resolved === "light" ? "#f4f7f8" : "#0b1518");
  for (const button of document.querySelectorAll<HTMLButtonElement>("[data-theme-option]")) {
    button.setAttribute("aria-pressed", String(button.dataset.themeOption === mode));
  }
}

export function initTheme(): void {
  applyTheme(storedMode());
  document.addEventListener("click", (event) => {
    const button = (event.target as Element).closest<HTMLButtonElement>("[data-theme-option]");
    if (!button) return;
    const mode = button.dataset.themeOption as ThemeMode;
    try {
      localStorage.setItem(THEME_STORAGE_KEY, mode);
    } catch {
      // Private mode: the choice holds for this page only.
    }
    applyTheme(mode);
  });
  // "System" follows the device while the page is open.
  matchMedia("(prefers-color-scheme: light)").addEventListener("change", () => {
    if (storedMode() === "system") applyTheme("system");
  });
}

export function initMenu(): void {
  const menu = document.querySelector<HTMLDialogElement>("[data-menu]");
  if (!menu) return;
  document.querySelector("[data-menu-open]")?.addEventListener("click", () => menu.showModal());
  menu.querySelector("[data-menu-close]")?.addEventListener("click", () => menu.close());
  // A choice made inside the menu (a section, an access action) closes it.
  menu.addEventListener("click", (event) => {
    if ((event.target as Element).closest("a")) menu.close();
  });
}

/** Publishes the sticky header's height as `--landing-header` (one row from `lg`, two on a tablet,
 * plus the notch inset) for the FAQ's sticky topic row. */
export function initHeaderHeight(): void {
  const header = document.querySelector<HTMLElement>("[data-landing-header]");
  if (!header) return;
  const publish = () =>
    document.documentElement.style.setProperty("--landing-header", `${header.offsetHeight}px`);
  publish();
  if (typeof ResizeObserver !== "undefined") new ResizeObserver(publish).observe(header);
}

/** Every FAQ answer starts closed, except the one the address points at. */
export function openLinkedDetails(): void {
  const open = () => {
    const id = decodeURIComponent(location.hash.slice(1));
    const target = id ? document.getElementById(id) : null;
    if (target instanceof HTMLDetailsElement) {
      target.open = true;
      target.scrollIntoView({ block: "start" });
    }
  };
  open();
  addEventListener("hashchange", open);
}

initTheme();
initMenu();
initHeaderHeight();
openLinkedDetails();
