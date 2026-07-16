import { type ReactNode, useCallback, useEffect, useMemo, useState } from "react";

import {
  THEME_STORAGE_KEY,
  ThemeContext,
  type ResolvedTheme,
  type ThemeMode,
  resolveTheme,
} from "./useTheme";

function readStoredMode(): ThemeMode {
  const stored = globalThis.localStorage?.getItem(THEME_STORAGE_KEY);
  return stored === "light" || stored === "dark" || stored === "system" ? stored : "dark";
}

function apply(resolved: ResolvedTheme): void {
  document.documentElement.dataset.theme = resolved;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>(readStoredMode);
  const [systemTheme, setSystemTheme] = useState<ResolvedTheme>(() => resolveTheme("system"));

  const setMode = useCallback((next: ThemeMode) => {
    globalThis.localStorage?.setItem(THEME_STORAGE_KEY, next);
    setModeState(next);
  }, []);

  const resolved = useMemo<ResolvedTheme>(
    () => (mode === "system" ? systemTheme : mode),
    [mode, systemTheme],
  );

  // Apply to the DOM whenever the resolved theme changes.
  useEffect(() => {
    apply(resolved);
  }, [resolved]);

  // Follow OS changes; only affects `resolved` while in "system" mode.
  useEffect(() => {
    const mql = globalThis.matchMedia?.("(prefers-color-scheme: light)");
    if (!mql) return;
    const onChange = () => setSystemTheme(resolveTheme("system"));
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  const value = useMemo(() => ({ mode, resolved, setMode }), [mode, resolved, setMode]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
