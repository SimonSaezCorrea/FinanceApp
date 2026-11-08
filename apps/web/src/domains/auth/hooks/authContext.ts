import { createContext } from "react";

import type { auth } from "@finance/contracts";

/**
 * The session context, in a module of its own on purpose: `useAuth.tsx` imports i18n, so editing a
 * catalog makes Vite re-run it during a hot reload. Were the context created there, that re-run
 * would make a NEW context while the mounted `AuthProvider` still served the old one, and every
 * `useAuth` re-rendered by Fast Refresh threw "useAuth must be used within AuthProvider". This
 * module imports nothing that changes, so it keeps the same context across reloads.
 */
export interface AuthContextValue {
  user: auth.CurrentUser | null;
  loading: boolean;
  /** Ends the session and leaves for the public site's home. */
  logout: () => Promise<void>;
  /** Re-fetches /auth/me and refreshes the cached user (after a profile/preferences edit). */
  refreshUser: () => Promise<auth.CurrentUser | null>;
  /** Clears the local user without calling the API (session already ended server-side, e.g. deactivate). */
  clearUser: () => void;
}

export const AuthContext = createContext<AuthContextValue | null>(null);
