import { type ReactNode, createContext, useContext, useEffect, useMemo, useState } from "react";

import type { auth } from "@finance/contracts";

import { authApi } from "@finance/client";

import { assignLocation } from "../../../shared/lib/leaveApp";
import { landingHomeUrl } from "../../../shared/lib/landingUrl";

/**
 * The app's session. Signing in and registering happen on the public site (spec 031), which
 * leaves the API's session cookies behind and sends the person here; this provider only reads that
 * session (`/auth/me`), keeps it fresh after profile edits, and ends it.
 */
interface AuthContextValue {
  user: auth.CurrentUser | null;
  loading: boolean;
  /** Ends the session and leaves for the public site's home. */
  logout: () => Promise<void>;
  /** Re-fetches /auth/me and refreshes the cached user (after a profile/preferences edit). */
  refreshUser: () => Promise<auth.CurrentUser | null>;
  /** Clears the local user without calling the API (session already ended server-side, e.g. deactivate). */
  clearUser: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<auth.CurrentUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    authApi
      .me()
      .then(setUser)
      .catch(() => setUser(null)) // any failure (401, network, no fetch) → signed out
      .finally(() => setLoading(false));
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      logout: async () => {
        await authApi.logout();
        // Not `setUser(null)`: that would make the current page's gate send the person to the
        // access panel first. The public site's home is where signing out ends.
        assignLocation(landingHomeUrl());
      },
      refreshUser: async () => {
        const next = await authApi.me().catch(() => null);
        setUser(next);
        return next;
      },
      clearUser: () => setUser(null),
    }),
    [user, loading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
