import { KeyRound, ShieldCheck } from "lucide-react";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { ApiRequestError } from "../../../shared/lib/apiClient";
import { formatRutInput } from "../../../shared/lib/formatRut";
import { Button } from "../../../shared/ui/button";
import { useAuth } from "../hooks/useAuth";
import { validateRequired, validateRut } from "../lib/validation";
import { UnderlineField } from "./UnderlineField";

export type LoginStep = "credentials" | "mfa";

interface LoginFormProps {
  /** Called once a session exists — by password (+MFA), by the passkey button, or by the
   * browser's own autofill suggestion. The host decides what happens next. */
  onSuccess: () => void;
  /** Lets the host retitle itself while the second factor is being asked for. */
  onStepChange?: (step: LoginStep) => void;
  /** Optional controlled RUT, so the access panel keeps what was typed when switching to
   * "Crear cuenta" and back. Uncontrolled when omitted. */
  identifierValue?: string;
  onIdentifierValueChange?: (value: string) => void;
}

/** Passkey first (one tap, no password, no second factor), RUT + password as the alternative,
 * and the TOTP step when the account has MFA. */
export function LoginForm({
  onSuccess,
  onStepChange,
  identifierValue: controlledRut,
  onIdentifierValueChange,
}: Readonly<LoginFormProps>) {
  const { t } = useTranslation();
  const { login, verifyMfa, loginWithPasskey, tryConditionalPasskeyLogin, user } = useAuth();
  const [localRut, setLocalRut] = useState("");
  const identifierValue = controlledRut ?? localRut;
  const setIdentifierValue = onIdentifierValueChange ?? setLocalRut;
  const [password, setPassword] = useState("");
  const [mfaCode, setMfaCode] = useState("");
  const [step, setStepState] = useState<LoginStep>("credentials");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [passkeyBusy, setPasskeyBusy] = useState(false);
  const [touched, setTouched] = useState({ rut: false, password: false });
  const [submitted, setSubmitted] = useState(false);
  const conditionalAbortRef = useRef<AbortController | null>(null);
  const onSuccessRef = useRef(onSuccess);
  useEffect(() => {
    onSuccessRef.current = onSuccess;
  });

  const rutError = validateRut(identifierValue);
  const passwordError = validateRequired(password);
  // A malformed value shows once the field is left; "required" only after a submit attempt, so
  // tabbing past an empty field (or switching to "Crear cuenta") doesn't flag it.
  const fieldError = (code: string | null, fieldTouched: boolean) =>
    code && (submitted || (fieldTouched && code !== "required"))
      ? t(`auth.validation.${code}`)
      : null;

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
    setError(null);
    if (step === "credentials") {
      // Caught here instead of by the server: a mistyped check digit would otherwise come back
      // as the same "RUT o contraseña incorrectos" as a wrong password.
      setSubmitted(true);
      if (rutError || passwordError) return;
    }
    conditionalAbortRef.current?.abort();
    setBusy(true);
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
    setError(null);
    // An empty RUT is fine (the browser offers its own account picker); a malformed one isn't.
    if (identifierValue.trim() && rutError) {
      setTouched((prev) => ({ ...prev, rut: true }));
      return;
    }
    conditionalAbortRef.current?.abort();
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
      <form className="flex flex-col gap-6" onSubmit={onSubmit} noValidate>
        <Hero icon={ShieldCheck} title={t("auth.mfa.title")} subtitle={t("auth.mfa.hint")} />
        <UnderlineField
          label={t("auth.mfa.codeLabel")}
          value={mfaCode}
          onChange={setMfaCode}
          placeholder={t("auth.mfa.placeholder")}
          autoFocus
          autoComplete="one-time-code"
          numeric
        />
        {error ? (
          <p role="alert" className="-mt-2 text-sm text-destructive">
            {error}
          </p>
        ) : null}
        <div className="flex flex-col gap-2">
          <Button type="submit" size="lg" disabled={busy || !mfaCode.trim()} className="w-full">
            {busy ? t("auth.mfa.verifying") : t("auth.mfa.verify")}
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
        </div>
      </form>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <Hero icon={KeyRound} title={t("auth.login.title")} subtitle={t("auth.login.subtitle")} />

      <Button
        size="lg"
        className="w-full"
        disabled={passkeyBusy}
        onClick={() => void onPasskeyLogin()}
      >
        <KeyRound className="size-[18px]" aria-hidden />
        {passkeyBusy ? t("auth.passkey.waiting") : t("auth.passkey.signIn")}
      </Button>

      <div className="flex items-center gap-3 text-xs text-dim">
        <span className="h-px flex-1 bg-border" aria-hidden />
        {t("auth.login.orWithRut")}
        <span className="h-px flex-1 bg-border" aria-hidden />
      </div>

      <form className="flex flex-col gap-5" onSubmit={onSubmit} noValidate>
        <UnderlineField
          label={t("auth.rut")}
          value={identifierValue}
          onChange={(v) => setIdentifierValue(formatRutInput(v))}
          onBlur={() => setTouched((prev) => ({ ...prev, rut: true }))}
          error={fieldError(rutError, touched.rut)}
          valid={!rutError}
          placeholder={t("auth.placeholders.rut")}
          autoComplete="username webauthn"
          numeric
        />
        <UnderlineField
          label={t("auth.password")}
          value={password}
          onChange={setPassword}
          onBlur={() => setTouched((prev) => ({ ...prev, password: true }))}
          error={fieldError(passwordError, touched.password)}
          type="password"
          placeholder={t("auth.placeholders.password")}
          autoComplete="current-password"
        />
        {error ? (
          <p role="alert" className="-mt-1 text-sm text-destructive">
            {error}
          </p>
        ) : null}
        <Button type="submit" variant="outline" size="lg" disabled={busy} className="w-full">
          {busy ? t("auth.signingIn") : t("auth.signIn")}
        </Button>
      </form>
    </div>
  );
}

/** Centered icon + title + one line: what this step asks for, before the fields. */
function Hero({
  icon: Icon,
  title,
  subtitle,
}: Readonly<{ icon: typeof KeyRound; title: string; subtitle: string }>) {
  return (
    <div className="flex flex-col items-center gap-3 pt-2 text-center">
      <span className="grid size-16 place-items-center rounded-full bg-primary/15 text-primary shadow-[0_0_0_10px_hsl(var(--primary)/0.05)]">
        <Icon className="size-7" aria-hidden />
      </span>
      <h2 className="mt-2 text-2xl font-bold tracking-tight">{title}</h2>
      <p className="max-w-[36ch] text-sm leading-relaxed text-muted-foreground">{subtitle}</p>
    </div>
  );
}
