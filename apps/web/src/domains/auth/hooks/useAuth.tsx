import { type ReactNode, createContext, useContext, useEffect, useMemo, useState } from "react";

import type { auth } from "@finance/contracts";

import { resetAuthRefresh } from "../../../shared/lib/apiClient";
import { authApi } from "../api/authApi";

interface AuthContextValue {
  user: auth.CurrentUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (input: auth.RegisterRequest) => Promise<void>;
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
      // `resetAuthRefresh` re-arms the silent refresh: it disables itself after a
      // failure so a dead session can't be re-asked on every request, and a fresh
      // login is exactly the event that makes it valid again.
      login: async (email, password) => {
        const next = await authApi.login({ email, password });
        resetAuthRefresh();
        setUser(next);
      },
      register: async (input) => {
        const next = await authApi.register(input);
        resetAuthRefresh();
        setUser(next);
      },
      logout: async () => {
        await authApi.logout();
        setUser(null);
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
