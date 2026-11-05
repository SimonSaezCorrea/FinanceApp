import { KeyRound, Mail, ShieldCheck } from "lucide-react";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { MFA_CODE_RESEND_SECONDS } from "@finance/contracts/auth-rules";
import { useTranslation } from "react-i18next";

import { ApiRequestError, authApi, failureCode } from "@finance/client";
import { formatRutInput } from "@finance/ui/src/shared/lib/formatRut";
import { withBrand } from "@finance/ui/src/shared/lib/brand";
import { Button } from "@finance/ui/src/shared/ui/button";
import { FormNotice } from "@finance/ui/src/shared/ui/form/FormNotice";
import { useAuth } from "../hooks/useAuth";
import { CheckCard } from "./CheckCard";
import { validateRequired, validateRut } from "../lib/validation";
import { UnderlineField } from "./UnderlineField";

export type LoginStep = "credentials" | "mfa";

/** One emailed code a minute (the API's `MFA_CODE_RESEND_SECONDS`). */
const RESEND_SECONDS = MFA_CODE_RESEND_SECONDS;

interface LoginFormProps {
  /** Called once a session exists — by password (+MFA), by the passkey button, or by the
   * browser's own autofill suggestion. Called exactly once per sign-in. The host decides what
   * happens next. */
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
  const { login, verifyMfa, resendMfaCode, loginWithPasskey, tryConditionalPasskeyLogin, user } =
    useAuth();
  const [localRut, setLocalRut] = useState("");
  const identifierValue = controlledRut ?? localRut;
  const setIdentifierValue = onIdentifierValueChange ?? setLocalRut;
  const [password, setPassword] = useState("");
  const [mfaCode, setMfaCode] = useState("");
  /** Off by default: remembering a browser is a choice (specs/040). */
  const [rememberDevice, setRememberDevice] = useState(false);
  /** The second factor this account asks for (specs/040): the app's code, or one by email. */
  const [mfaMethod, setMfaMethod] = useState<"totp" | "email">("totp");
  /** Seconds until "Reenviar código" works again (email only). */
  const [resendIn, setResendIn] = useState(0);
  const [resendState, setResendState] = useState<"idle" | "sending" | "sent">("idle");
  const [step, setStepState] = useState<LoginStep>("credentials");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [passkeyBusy, setPasskeyBusy] = useState(false);
  /** Informational, not an error: the passkey ceremony didn't finish (cancelled, or no passkey
   * on this device — the browser reports both the same way, so the copy covers both). */
  const [passkeyNotice, setPasskeyNotice] = useState(false);
  const [forgotOpen, setForgotOpen] = useState(false);
  /** "¿Olvidaste tu contraseña?" (specs/032 US2): sends a link to the account behind the RUT. */
  const [forgot, setForgot] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [forgotError, setForgotError] = useState<string | null>(null);
  const [touched, setTouched] = useState({ rut: false, password: false });
  const [submitted, setSubmitted] = useState(false);
  const conditionalAbortRef = useRef<AbortController | null>(null);
  const onSuccessRef = useRef(onSuccess);
  useEffect(() => {
    onSuccessRef.current = onSuccess;
  });
  // A session can be reported by an explicit path AND by the effect below watching `user`; the
  // host must hear it once (it navigates). The explicit call can't be dropped: setting the
  // session closes the panel, which may unmount this form before its effect ever runs.
  const reportedRef = useRef(false);
  function reportSuccess() {
    if (reportedRef.current) return;
    reportedRef.current = true;
    onSuccessRef.current();
  }

  const rutError = validateRut(identifierValue);
  const passwordError = validateRequired(password);
  // A malformed value shows once the field is left; "required" only after a submit attempt, so
  // tabbing past an empty field (or switching to "Crear cuenta") doesn't flag it.
  const fieldError = (code: string | null, fieldTouched: boolean) =>
    code && (submitted || (fieldTouched && code !== "required"))
      ? t(`auth.validation.${code}`)
      : null;

  /** Always the same answer whatever the RUT (the API never says whether it exists); only a RUT
   * that is not a RUT at all is stopped here, on its own field. */
  async function onForgot() {
    if (rutError) {
      setTouched((prev) => ({ ...prev, rut: true }));
      setSubmitted(true);
      return;
    }
    setForgot("sending");
    try {
      await authApi.forgotPassword({ identifierValue });
      setForgot("sent");
    } catch (err) {
      setForgotError(errorText(err));
      setForgot("error");
    }
  }

  /** What failed, in words: the API's own reason, "couldn't reach fik", or a server error. */
  function errorText(err: unknown): string {
    return t(`errors.${failureCode(err)}`, { defaultValue: t("errors.INTERNAL_ERROR") });
  }

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

  // The autofill passkey (above) sets `user` with no callback of its own — this reports it.
  useEffect(() => {
    if (user) reportSuccess();
  }, [user]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setPasskeyNotice(false);
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
        const outcome = await login(identifierValue, password);
        if (outcome.mfaRequired) {
          setMfaMethod(outcome.mfaMethod);
          setResendState("idle");
          if (outcome.mfaMethod === "email") {
            setResendIn(outcome.retryAfterSeconds ?? RESEND_SECONDS);
            if (outcome.codeSent === false && outcome.retryAfterSeconds === undefined) {
              setError(t("auth.mfa.email.notSent"));
            }
          }
          setStep("mfa");
        } else reportSuccess();
      } else {
        await verifyMfa(mfaCode, rememberDevice);
        reportSuccess();
      }
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  async function onPasskeyLogin() {
    setError(null);
    setPasskeyNotice(false);
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
      reportSuccess();
    } catch (err) {
      // The ceremony didn't finish (closed prompt, no passkey here, or the server didn't match it):
      // not "wrong credentials" — say what to do instead. No answer from the server, or any other
      // server error, is said as such.
      const code = failureCode(err);
      if (
        code === "NETWORK_ERROR" ||
        (err instanceof ApiRequestError && code !== "INVALID_CREDENTIALS")
      ) {
        setError(errorText(err));
      } else {
        setPasskeyNotice(true);
      }
    } finally {
      setPasskeyBusy(false);
    }
  }

  async function onResend() {
    setError(null);
    setResendState("sending");
    try {
      await resendMfaCode();
      setResendState("sent");
      setResendIn(RESEND_SECONDS);
    } catch (err) {
      setResendState("idle");
      const wait = err instanceof ApiRequestError ? err.details?.retryAfterSeconds : undefined;
      if (typeof wait === "number") setResendIn(wait);
      setError(errorText(err));
    }
  }

  if (step === "mfa") {
    const byEmail = mfaMethod === "email";
    return (
      <form className="flex flex-col gap-6" onSubmit={onSubmit} noValidate>
        <Hero
          icon={byEmail ? Mail : ShieldCheck}
          title={t("auth.mfa.title")}
          subtitle={byEmail ? t("auth.mfa.email.hint") : t("auth.mfa.hint")}
        />
        <UnderlineField
          label={t("auth.mfa.codeLabel")}
          value={mfaCode}
          onChange={setMfaCode}
          placeholder={t("auth.mfa.placeholder")}
          autoFocus
          autoComplete="one-time-code"
          numeric
        />
        {byEmail ? (
          <ResendCode
            seconds={resendIn}
            onTick={setResendIn}
            sending={resendState === "sending"}
            sent={resendState === "sent"}
            onResend={() => void onResend()}
          />
        ) : null}
        <CheckCard
          title={t("auth.mfa.rememberDevice")}
          checked={rememberDevice}
          onChange={setRememberDevice}
        >
          {t("auth.mfa.rememberDeviceHint")}
        </CheckCard>
        {error ? (
          <p role="alert" className="-mt-2 text-sm text-destructive">
            {error ? withBrand(error) : null}
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
              setRememberDevice(false);
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
      {passkeyNotice ? (
        <FormNotice icon={KeyRound} className="-mt-2">
          <span role="status">{t("auth.passkey.notCompleted")}</span>
        </FormNotice>
      ) : null}

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
        <button
          type="button"
          onClick={() => setForgotOpen((open) => !open)}
          aria-expanded={forgotOpen}
          className="-mt-3 self-end text-[13px] font-medium text-primary hover:underline"
        >
          {t("auth.forgot.link")}
        </button>
        {forgotOpen ? (
          <FormNotice>
            <span className="flex flex-col gap-2">
              {forgot === "sent" ? (
                <span role="status">{t("auth.forgot.sent")}</span>
              ) : (
                <>
                  <span>{t("auth.forgot.body")}</span>
                  {forgot === "error" ? (
                    <span role="alert" className="text-destructive">
                      {forgotError ? withBrand(forgotError) : null}
                    </span>
                  ) : null}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="self-start"
                    disabled={forgot === "sending"}
                    onClick={() => void onForgot()}
                  >
                    {forgot === "sending" ? t("auth.forgot.sending") : t("auth.forgot.send")}
                  </Button>
                </>
              )}
            </span>
          </FormNotice>
        ) : null}
        {error ? (
          <p role="alert" className="-mt-1 text-sm text-destructive">
            {error ? withBrand(error) : null}
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

/** "Reenviar código" with the wait the API asked for, counted down each second. */
function ResendCode({
  seconds,
  onTick,
  sending,
  sent,
  onResend,
}: Readonly<{
  seconds: number;
  onTick: (next: number) => void;
  sending: boolean;
  sent: boolean;
  onResend: () => void;
}>) {
  const { t } = useTranslation();
  useEffect(() => {
    if (seconds <= 0) return;
    const id = setTimeout(() => onTick(seconds - 1), 1000);
    return () => clearTimeout(id);
  }, [seconds, onTick]);
  return (
    <div className="-mt-2 flex flex-wrap items-center justify-between gap-2 text-sm">
      <span className="text-muted-foreground" aria-live="polite">
        {sent ? t("auth.mfa.email.resent") : t("auth.mfa.email.noCode")}
      </span>
      <button
        type="button"
        className="font-medium text-primary underline-offset-4 hover:underline disabled:text-muted-foreground disabled:no-underline"
        disabled={seconds > 0 || sending}
        onClick={onResend}
      >
        {seconds > 0
          ? t("auth.mfa.email.resendIn", { seconds })
          : sending
            ? t("auth.mfa.email.resending")
            : t("auth.mfa.email.resend")}
      </button>
    </div>
  );
}
