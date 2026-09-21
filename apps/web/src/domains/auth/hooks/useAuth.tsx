import { type ReactNode, createContext, useContext, useEffect, useMemo, useState } from "react";

import type { auth } from "@finance/contracts";

import { resetAuthRefresh } from "../../../shared/lib/apiClient";
import {
  isConditionalMediationSupported,
  serializeGetResponse,
  toGetOptions,
} from "../../../shared/lib/webauthn";
import { authApi } from "../api/authApi";
import { passkeyApi } from "../api/passkeyApi";

interface AuthContextValue {
  user: auth.CurrentUser | null;
  loading: boolean;
  /** Resolves `{mfaRequired: true}` without setting a session when the account has MFA active —
   * the caller must then collect a code and call `verifyMfa`. Login is by RUT (Chilean
   * convention), not email — email stays on the account purely for contact/notifications. */
  login: (identifierValue: string, password: string) => Promise<{ mfaRequired: boolean }>;
  /** Completes a pending login's second factor (TOTP or recovery code, single field). */
  verifyMfa: (code: string) => Promise<void>;
  /** Full login via a registered passkey — no password, and never routes through MFA even if
   * the account has it active (specs/022 FR-006/FR-007). `identifierValue` (the titular's RUT)
   * omitted = discoverable/"usernameless" login: the browser offers its own account picker for
   * any resident passkey on this site, with nothing typed. Throws if the device ceremony is
   * cancelled/fails or the server rejects the assertion. */
  loginWithPasskey: (identifierValue?: string) => Promise<void>;
  /** Autofill-driven login (specs/025): attempted once when the login screen mounts, never on a
   * click. Silently does nothing on an unsupported browser, a declined/empty suggestion, or when
   * `signal` aborts (the password form was submitted instead) — never throws, matching the
   * "explicit button is the only required path" requirement (FR-006/FR-007). */
  tryConditionalPasskeyLogin: (signal: AbortSignal) => Promise<void>;
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
      login: async (identifierValue, password) => {
        const result = await authApi.login({ identifierValue, password });
        if (result.mfaRequired) return { mfaRequired: true };
        resetAuthRefresh();
        setUser(result.user);
        return { mfaRequired: false };
      },
      verifyMfa: async (code) => {
        const { user: next } = await authApi.verifyMfaLogin({ code });
        resetAuthRefresh();
        setUser(next);
      },
      loginWithPasskey: async (identifierValue) => {
        const { options } = await passkeyApi.startLogin({ identifierValue });
        const credential = await navigator.credentials.get(toGetOptions(options));
        if (!credential) throw new Error("passkey ceremony cancelled");
        const { user: next } = await passkeyApi.verifyLogin({
          response: serializeGetResponse(credential),
        });
        resetAuthRefresh();
        setUser(next);
      },
      tryConditionalPasskeyLogin: async (signal) => {
        if (!(await isConditionalMediationSupported())) return;
        try {
          const { options } = await passkeyApi.startLogin({});
          const credential = await navigator.credentials.get(
            toGetOptions(options, { mediation: "conditional", signal }),
          );
          if (!credential) return;
          const { user: next } = await passkeyApi.verifyLogin({
            response: serializeGetResponse(credential),
          });
          resetAuthRefresh();
          setUser(next);
        } catch {
          // Aborted (password login submitted instead) or declined/failed — the explicit
          // button remains the fallback, this path never surfaces an error (FR-007).
        }
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
