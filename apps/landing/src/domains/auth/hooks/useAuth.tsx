import { type ReactNode, createContext, useContext, useMemo, useState } from "react";

import type { auth } from "@finance/contracts";

import {
  authApi,
  isConditionalMediationSupported,
  passkeyApi,
  resetAuthRefresh,
  serializeGetResponse,
  toGetOptions,
} from "@finance/client";

/**
 * The public site's side of signing in (spec 031): the calls the access panel's forms make, with
 * the same shape as the app's `useAuth` so the forms are shared as-is. Unlike the app it never asks
 * `/auth/me` on mount (the header script does that, R8), keeps no session of its own — `user` only
 * marks that a sign-in just succeeded — and stamps a new account with the page's language
 * (FR-010a).
 */
interface AccessContextValue {
  user: auth.CurrentUser | null;
  login: (identifierValue: string, password: string) => Promise<{ mfaRequired: boolean }>;
  verifyMfa: (code: string) => Promise<void>;
  loginWithPasskey: (identifierValue?: string) => Promise<void>;
  tryConditionalPasskeyLogin: (signal: AbortSignal) => Promise<void>;
  register: (input: auth.RegisterRequest) => Promise<void>;
}

const AccessContext = createContext<AccessContextValue | null>(null);

export function AccessProvider({
  locale,
  children,
}: Readonly<{ locale: auth.CurrentUser["locale"]; children: ReactNode }>) {
  const [user, setUser] = useState<auth.CurrentUser | null>(null);

  const value = useMemo<AccessContextValue>(
    () => ({
      user,
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
          // Aborted or declined: the explicit button stays the way in (specs/025).
        }
      },
      register: async (input) => {
        const next = await authApi.register({ ...input, locale });
        resetAuthRefresh();
        setUser(next);
      },
    }),
    [user, locale],
  );

  return <AccessContext.Provider value={value}>{children}</AccessContext.Provider>;
}

export function useAuth(): AccessContextValue {
  const ctx = useContext(AccessContext);
  if (!ctx) throw new Error("useAuth must be used within AccessProvider");
  return ctx;
}
