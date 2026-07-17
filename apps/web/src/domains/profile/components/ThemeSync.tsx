import { useEffect, useRef } from "react";

import { useAuth } from "../../auth/hooks/useAuth";
import { useTheme } from "../../../theme/useTheme";
import { useProfileMutations } from "../hooks/useProfile";

/**
 * Keeps the theme preference (FR-007a) in sync with the backend, without inverting the provider
 * order (`ThemeProvider` wraps `AuthProvider`, so `ThemeProvider` itself cannot read `useAuth`).
 * Mounted once inside the authenticated layout: on load, the backend's stored theme wins over
 * whatever was in localStorage; from then on, local theme changes (from either toggle) are pushed
 * to the backend in the background.
 */
export function ThemeSync() {
  const { user } = useAuth();
  const { mode, setMode } = useTheme();
  const { updatePreferences } = useProfileMutations();
  const appliedBackendTheme = useRef(false);

  useEffect(() => {
    if (!user || appliedBackendTheme.current) return;
    appliedBackendTheme.current = true;
    if (user.theme !== mode) setMode(user.theme);
    // Only ever runs once per session, when the user first resolves.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  useEffect(() => {
    if (!user || !appliedBackendTheme.current) return;
    if (user.theme !== mode) updatePreferences.mutate({ theme: mode });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  return null;
}
