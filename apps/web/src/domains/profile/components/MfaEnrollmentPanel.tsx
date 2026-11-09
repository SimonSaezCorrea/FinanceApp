import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { toast } from "sonner";
import { Mail, Smartphone } from "lucide-react";

import type { auth } from "@finance/contracts";
import { ApiRequestError } from "@finance/client";
import { cn } from "@finance/ui/src/shared/lib/cn";
import { Button } from "@finance/ui/src/shared/ui/button";
import { FormNotice } from "@finance/ui/src/shared/ui/form/FormNotice";
import { FormSurface } from "@finance/ui/src/shared/ui/overlay";
import { Field } from "../../../shared/ui/field";
import { Input } from "@finance/ui/src/shared/ui/input";
import { useAuth } from "../../auth/hooks/useAuth";
import { useProfileMutations } from "../hooks/useProfile";
import { useStepUp } from "../hooks/useStepUp";
import { RecoveryCodesList } from "./RecoveryCodesList";

type Step = "choose" | "enroll" | "codes";
type Method = auth.MfaMethod;

/**
 * Setting up the second factor (specs/021, specs/040). Activation: choose the app or a code by
 * email, prove it with a first code, then the 10 recovery codes shown exactly once. Change
 * (`mode="change"`): straight to the other method; the server asks for a step-up first, and the
 * recovery codes are kept, so it ends with a toast instead of new codes.
 */
export function MfaEnrollmentPanel({
  open,
  onOpenChange,
  mode = "activate",
}: Readonly<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode?: "activate" | "change";
}>) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { startMfaEnrollment, confirmMfaEnrollment } = useProfileMutations();
  // Turning it on asks for a step-up too, not only a change (GHSA-jhp2-jfjr-fqfq).
  const { needsStepUp, stepUpPanel } = useStepUp(
    t(
      mode === "change"
        ? "profile.security.mfa.change.stepUpHint"
        : "profile.security.mfa.activateStepUpHint",
    ),
  );
  const [step, setStep] = useState<Step>("choose");
  const [method, setMethod] = useState<Method>("totp");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [resent, setResent] = useState(false);
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [prevOpen, setPrevOpen] = useState(false);

  const emailVerified = user?.emailVerified ?? false;
  const otherMethod: Method = user?.mfaMethod === "email" ? "totp" : "email";

  function errorText(err: unknown) {
    const errCode = err instanceof ApiRequestError ? err.code : "INTERNAL_ERROR";
    return t(`errors.${errCode}`, { defaultValue: t("errors.INTERNAL_ERROR") });
  }

  function start(next: Method, again = false) {
    setError(null);
    setMethod(next);
    startMfaEnrollment.mutate(
      { method: next },
      {
        onSuccess: () => {
          setStep("enroll");
          if (again) setResent(true);
        },
        onError: (err) => {
          if (needsStepUp(err, () => start(next, again))) return;
          setError(errorText(err));
        },
      },
    );
  }

  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setCode("");
      setError(null);
      setResent(false);
      setStep(mode === "change" ? "enroll" : "choose");
      if (mode === "change") setMethod(otherMethod);
    }
  }

  // A change goes straight to the other method (the server may ask for a step-up first).
  useEffect(() => {
    if (open && mode === "change") start(otherMethod);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mode]);

  async function handleConfirm() {
    setError(null);
    try {
      const { recoveryCodes: codes } = await confirmMfaEnrollment.mutateAsync({ code });
      if (codes === null) {
        toast.success(t("profile.security.mfa.change.done", { method: methodName(method) }));
        onOpenChange(false);
        return;
      }
      setRecoveryCodes(codes);
      setStep("codes");
    } catch (err) {
      setError(errorText(err));
    }
  }

  function methodName(m: Method) {
    return t(`profile.security.mfa.methods.${m}.title`);
  }

  if (step === "codes") {
    return (
      <FormSurface
        open={open}
        onOpenChange={onOpenChange}
        mode="create"
        surface="panel"
        eyebrow={t("profile.security.title")}
        title={t("profile.security.mfa.codesTitle")}
        description={t("profile.security.mfa.codesHint")}
        submitLabel={t("profile.security.mfa.done")}
        onSubmit={() => onOpenChange(false)}
        hideCancel
      >
        <RecoveryCodesList codes={recoveryCodes} />
      </FormSurface>
    );
  }

  if (step === "choose") {
    return (
      <FormSurface
        open={open}
        onOpenChange={onOpenChange}
        mode="create"
        surface="panel"
        eyebrow={t("profile.security.title")}
        title={t("profile.security.mfa.enrollTitle")}
        description={t("profile.security.mfa.chooseHint")}
        submitLabel={t("profile.security.mfa.continue")}
        onSubmit={() => start(method)}
        canSubmit={method === "totp" || emailVerified}
        submitting={startMfaEnrollment.isPending}
      >
        <div className="flex flex-col gap-3" role="radiogroup">
          <MethodOption
            icon={Smartphone}
            title={methodName("totp")}
            hint={t("profile.security.mfa.methods.totp.hint")}
            selected={method === "totp"}
            onSelect={() => setMethod("totp")}
          />
          <MethodOption
            icon={Mail}
            title={methodName("email")}
            hint={t("profile.security.mfa.methods.email.hint")}
            selected={method === "email"}
            disabled={!emailVerified}
            onSelect={() => setMethod("email")}
          />
          {!emailVerified ? (
            <p className="text-xs text-muted-foreground">
              {t("profile.security.mfa.methods.email.needsVerified")}{" "}
              <Link to="/profile/personal" className="font-medium text-primary underline">
                {t("profile.security.mfa.methods.email.verifyLink")}
              </Link>
            </p>
          ) : null}
          {method === "email" ? (
            <FormNotice tone="warning">
              {t("profile.security.mfa.methods.email.lessSecure")}
            </FormNotice>
          ) : null}
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </div>
      </FormSurface>
    );
  }

  const data = startMfaEnrollment.data;
  const totp = data && "qrCodeDataUrl" in data ? data : undefined;
  const byEmail = method === "email";

  return (
    <>
      <FormSurface
        open={open}
        onOpenChange={onOpenChange}
        mode="create"
        surface="panel"
        eyebrow={t("profile.security.title")}
        title={
          mode === "change"
            ? t("profile.security.mfa.change.title", { method: methodName(method) })
            : t("profile.security.mfa.enrollTitle")
        }
        description={
          byEmail
            ? t("profile.security.mfa.emailSentTo", { email: user?.email ?? "" })
            : t("profile.security.mfa.enrollHint")
        }
        submitLabel={t("profile.security.mfa.confirm")}
        onSubmit={() => void handleConfirm()}
        canSubmit={code.trim().length >= 6 && !startMfaEnrollment.isPending}
        submitting={confirmMfaEnrollment.isPending}
      >
        <div className="flex flex-col gap-4">
          {byEmail ? null : startMfaEnrollment.isPending || !totp ? (
            <p className="text-sm text-muted-foreground">{t("profile.security.mfa.loadingQr")}</p>
          ) : (
            <>
              <div className="flex justify-center">
                <img
                  src={totp.qrCodeDataUrl}
                  alt={t("profile.security.mfa.qrAlt")}
                  className="h-48 w-48 rounded-lg border bg-white p-2"
                />
              </div>
              <div>
                <p className="mb-1 text-xs text-muted-foreground">
                  {t("profile.security.mfa.manualEntry")}
                </p>
                <code className="block break-all rounded-md bg-muted/30 px-3 py-2 text-sm">
                  {totp.secret}
                </code>
              </div>
            </>
          )}
          <Field
            label={t("profile.security.mfa.codeLabel")}
            htmlFor="mfa-confirm-code"
            error={error}
          >
            <Input
              id="mfa-confirm-code"
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="000000"
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
          </Field>
          {byEmail ? (
            <div className="flex items-center justify-between gap-2 text-sm">
              <span className="text-muted-foreground" aria-live="polite">
                {resent ? t("profile.security.mfa.resent") : t("profile.security.mfa.noCode")}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={startMfaEnrollment.isPending}
                onClick={() => start("email", true)}
              >
                {t("profile.security.mfa.resend")}
              </Button>
            </div>
          ) : null}
        </div>
      </FormSurface>
      {stepUpPanel}
    </>
  );
}

function MethodOption({
  icon: Icon,
  title,
  hint,
  selected,
  disabled,
  onSelect,
}: Readonly<{
  icon: typeof Mail;
  title: string;
  hint: string;
  selected: boolean;
  disabled?: boolean;
  onSelect: () => void;
}>) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      disabled={disabled}
      onClick={onSelect}
      className={cn(
        "flex items-start gap-3 rounded-xl border p-3.5 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60",
        selected ? "border-primary bg-primary/5" : "border-input hover:border-border2",
      )}
    >
      <Icon className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden />
      <span>
        <span className="block text-sm font-semibold">{title}</span>
        <span className="block text-xs text-muted-foreground">{hint}</span>
      </span>
    </button>
  );
}
