import { type FormEvent, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router";

import { ApiRequestError } from "../../../shared/lib/apiClient";
import { Button } from "../../../shared/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../../shared/ui/card";
import { Input } from "../../../shared/ui/input";
import { ThemeToggle } from "../../../shared/ui/theme-toggle";
import { useAuth } from "../hooks/useAuth";

export function LoginRoute() {
  const { t } = useTranslation();
  const { login, verifyMfa, loginWithPasskey, tryConditionalPasskeyLogin, user } = useAuth();
  const navigate = useNavigate();
  const [identifierValue, setIdentifierValue] = useState("");
  const [password, setPassword] = useState("");
  const [mfaCode, setMfaCode] = useState("");
  const [step, setStep] = useState<"credentials" | "mfa">("credentials");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [passkeyBusy, setPasskeyBusy] = useState(false);
  const conditionalAbortRef = useRef<AbortController | null>(null);

  // Autofill-driven passkey suggestion (specs/025) — attempted once on mount, never on a click.
  // Aborted on unmount and right before either login path submits, so it never competes with a
  // concurrent navigator.credentials.get() call (the browser throws InvalidStateError otherwise).
  useEffect(() => {
    const controller = new AbortController();
    conditionalAbortRef.current = controller;
    void tryConditionalPasskeyLogin(controller.signal);
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The conditional attempt above sets `user` directly (no navigate of its own) — this reacts to
  // that success exactly like the explicit paths do.
  useEffect(() => {
    if (user) navigate("/");
  }, [user, navigate]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    conditionalAbortRef.current?.abort();
    setBusy(true);
    setError(null);
    try {
      if (step === "credentials") {
        const { mfaRequired } = await login(identifierValue, password);
        if (mfaRequired) {
          setStep("mfa");
        } else {
          navigate("/");
        }
      } else {
        await verifyMfa(mfaCode);
        navigate("/");
      }
    } catch (err) {
      const code = err instanceof ApiRequestError ? err.code : "INTERNAL_ERROR";
      setError(t(`errors.${code}`));
    } finally {
      setBusy(false);
    }
  }

  async function onPasskeyLogin() {
    conditionalAbortRef.current?.abort();
    setError(null);
    setPasskeyBusy(true);
    try {
      // A RUT typed narrows the browser's picker to that account's own passkeys; left empty,
      // the browser offers an account picker for any resident passkey on this site on its own.
      await loginWithPasskey(identifierValue.trim() || undefined);
      navigate("/");
    } catch (err) {
      const code = err instanceof ApiRequestError ? err.code : "INVALID_CREDENTIALS";
      setError(t(`errors.${code}`, { defaultValue: t("errors.INVALID_CREDENTIALS") }));
    } finally {
      setPasskeyBusy(false);
    }
  }

  return (
    <main className="relative flex min-h-dvh items-center justify-center bg-muted/30 p-4">
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>{step === "credentials" ? t("auth.signIn") : t("auth.mfa.title")}</CardTitle>
        </CardHeader>
        <CardContent>
          {step === "credentials" ? (
            <form className="flex flex-col gap-3" onSubmit={onSubmit}>
              <Input
                type="text"
                placeholder={t("auth.rut")}
                value={identifierValue}
                required
                autoComplete="username webauthn"
                onChange={(e) => setIdentifierValue(e.target.value)}
              />
              <Input
                type="password"
                placeholder={t("auth.password")}
                value={password}
                required
                autoComplete="current-password"
                onChange={(e) => setPassword(e.target.value)}
              />
              {error ? (
                <p role="alert" className="text-sm text-destructive">
                  {error}
                </p>
              ) : null}
              <Button type="submit" disabled={busy} className="w-full">
                {t("auth.signIn")}
              </Button>
              <Button
                type="button"
                variant="outline"
                className="w-full"
                disabled={passkeyBusy}
                onClick={() => void onPasskeyLogin()}
              >
                {t("auth.passkey.signIn")}
              </Button>
            </form>
          ) : (
            <form className="flex flex-col gap-3" onSubmit={onSubmit}>
              <p className="text-sm text-muted-foreground">{t("auth.mfa.hint")}</p>
              <Input
                type="text"
                inputMode="text"
                placeholder={t("auth.mfa.placeholder")}
                value={mfaCode}
                required
                autoFocus
                autoComplete="one-time-code"
                onChange={(e) => setMfaCode(e.target.value)}
              />
              {error ? (
                <p role="alert" className="text-sm text-destructive">
                  {error}
                </p>
              ) : null}
              <Button type="submit" disabled={busy} className="w-full">
                {t("auth.mfa.verify")}
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="w-full"
                onClick={() => {
                  setStep("credentials");
                  setMfaCode("");
                  setError(null);
                }}
              >
                {t("auth.mfa.back")}
              </Button>
            </form>
          )}
          {step === "credentials" ? (
            <p className="mt-4 text-center text-sm text-muted-foreground">
              {t("auth.needAccount")}{" "}
              <Link to="/register" className="font-medium text-primary hover:underline">
                {t("auth.register")}
              </Link>
            </p>
          ) : null}
        </CardContent>
      </Card>
    </main>
  );
}
