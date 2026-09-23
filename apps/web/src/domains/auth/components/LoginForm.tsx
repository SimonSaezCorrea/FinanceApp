import { type FormEvent, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { ApiRequestError } from "../../../shared/lib/apiClient";
import { formatRutInput } from "../../../shared/lib/formatRut";
import { Button } from "../../../shared/ui/button";
import { FormTextField } from "../../../shared/ui/form";
import { Input } from "../../../shared/ui/input";
import { useAuth } from "../hooks/useAuth";

export type LoginStep = "credentials" | "mfa";

interface LoginFormProps {
  /** Called once a session exists — by password (+MFA), by the passkey button, or by the
   * browser's own autofill suggestion. Each host decides what happens next (navigate, close). */
  onSuccess: () => void;
  /** Lets the host retitle itself while the second factor is being asked for. */
  onStepChange?: (step: LoginStep) => void;
}

/** The actual login form — RUT + password, the TOTP step when the account has MFA, and the
 * passkey button. Shared by the standalone `/login` route and the landing's access panel, so
 * both sign in exactly the same way. */
export function LoginForm({ onSuccess, onStepChange }: Readonly<LoginFormProps>) {
  const { t } = useTranslation();
  const { login, verifyMfa, loginWithPasskey, tryConditionalPasskeyLogin, user } = useAuth();
  const [identifierValue, setIdentifierValue] = useState("");
  const [password, setPassword] = useState("");
  const [mfaCode, setMfaCode] = useState("");
  const [step, setStepState] = useState<LoginStep>("credentials");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [passkeyBusy, setPasskeyBusy] = useState(false);
  const conditionalAbortRef = useRef<AbortController | null>(null);
  const onSuccessRef = useRef(onSuccess);
  useEffect(() => {
    onSuccessRef.current = onSuccess;
  });

  function setStep(next: LoginStep) {
    setStepState(next);
    onStepChange?.(next);
  }

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

  // The conditional attempt above sets `user` directly (no callback of its own) — this reacts to
  // that success exactly like the explicit paths do.
  useEffect(() => {
    if (user) onSuccessRef.current();
  }, [user]);

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
          onSuccess();
        }
      } else {
        await verifyMfa(mfaCode);
        onSuccess();
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
      onSuccess();
    } catch (err) {
      const code = err instanceof ApiRequestError ? err.code : "INVALID_CREDENTIALS";
      setError(t(`errors.${code}`, { defaultValue: t("errors.INVALID_CREDENTIALS") }));
    } finally {
      setPasskeyBusy(false);
    }
  }

  if (step === "mfa") {
    return (
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
    );
  }

  return (
    <form className="flex flex-col" onSubmit={onSubmit}>
      <FormTextField
        label={t("auth.rut")}
        value={identifierValue}
        onChange={(v) => setIdentifierValue(formatRutInput(v))}
        placeholder={t("auth.placeholders.rut")}
        required
        autoComplete="username webauthn"
      />
      <FormTextField
        label={t("auth.password")}
        value={password}
        onChange={setPassword}
        type="password"
        placeholder={t("auth.placeholders.password")}
        required
        autoComplete="current-password"
      />
      {error ? (
        <p role="alert" className="pt-3 text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <Button type="submit" disabled={busy} className="mt-4 w-full">
        {t("auth.signIn")}
      </Button>
      <Button
        type="button"
        variant="outline"
        className="mt-2 w-full"
        disabled={passkeyBusy}
        onClick={() => void onPasskeyLogin()}
      >
        {t("auth.passkey.signIn")}
      </Button>
    </form>
  );
}
