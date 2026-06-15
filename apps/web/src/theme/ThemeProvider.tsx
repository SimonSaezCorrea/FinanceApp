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
  const [resolved, setResolved] = useState<ResolvedTheme>(() => resolveTheme(mode));

  const setMode = useCallback((next: ThemeMode) => {
    globalThis.localStorage?.setItem(THEME_STORAGE_KEY, next);
    setModeState(next);
  }, []);

  // Apply on mode change.
  useEffect(() => {
    const next = resolveTheme(mode);
    setResolved(next);
    apply(next);
  }, [mode]);

  // Follow OS changes while in "system" mode.
  useEffect(() => {
    if (mode !== "system") return;
    const mql = globalThis.matchMedia?.("(prefers-color-scheme: light)");
    if (!mql) return;
    const onChange = () => {
      const next = resolveTheme("system");
      setResolved(next);
      apply(next);
    };
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [mode]);

  const value = useMemo(() => ({ mode, resolved, setMode }), [mode, resolved, setMode]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
