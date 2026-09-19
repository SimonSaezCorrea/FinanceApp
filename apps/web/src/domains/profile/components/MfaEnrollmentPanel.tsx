import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, Copy } from "lucide-react";
import { toast } from "sonner";

import { ApiRequestError } from "../../../shared/lib/apiClient";
import { Button } from "../../../shared/ui/button";
import { FormSurface } from "../../../shared/ui/overlay";
import { Field } from "../../../shared/ui/field";
import { Input } from "../../../shared/ui/input";
import { useProfileMutations } from "../hooks/useProfile";

type Step = "enroll" | "codes";

/**
 * Activation flow (specs/021, US1): QR + manual secret, a code to confirm, then the 10
 * recovery codes shown exactly once. One panel, two steps — never closable back to "enroll"
 * once "codes" is reached (the codes only exist because activation already succeeded).
 */
export function MfaEnrollmentPanel({
  open,
  onOpenChange,
}: Readonly<{ open: boolean; onOpenChange: (open: boolean) => void }>) {
  const { t } = useTranslation();
  const { startMfaEnrollment, confirmMfaEnrollment } = useProfileMutations();
  const [step, setStep] = useState<Step>("enroll");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);
  const [prevOpen, setPrevOpen] = useState(open);

  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setStep("enroll");
      setCode("");
      setError(null);
      setCopied(false);
    }
  }

  useEffect(() => {
    if (open) {
      startMfaEnrollment.mutate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function handleConfirm() {
    setError(null);
    try {
      const { recoveryCodes: codes } = await confirmMfaEnrollment.mutateAsync({ code });
      setRecoveryCodes(codes);
      setStep("codes");
    } catch (err) {
      const errCode = err instanceof ApiRequestError ? err.code : "INTERNAL_ERROR";
      setError(t(`errors.${errCode}`, { defaultValue: t("errors.INTERNAL_ERROR") }));
    }
  }

  function handleCopyAll() {
    void navigator.clipboard.writeText(recoveryCodes.join("\n")).then(() => {
      setCopied(true);
      toast.success(t("profile.security.mfa.codesCopied"));
    });
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
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-2 rounded-lg border bg-muted/30 p-4 font-mono text-sm">
            {recoveryCodes.map((c) => (
              <span key={c}>{c}</span>
            ))}
          </div>
          <Button type="button" variant="outline" onClick={handleCopyAll} className="w-full gap-2">
            {copied ? (
              <Check className="h-4 w-4" aria-hidden />
            ) : (
              <Copy className="h-4 w-4" aria-hidden />
            )}
            {t("profile.security.mfa.copyAll")}
          </Button>
        </div>
      </FormSurface>
    );
  }

  const enrollment = startMfaEnrollment.data;

  return (
    <FormSurface
      open={open}
      onOpenChange={onOpenChange}
      mode="create"
      surface="panel"
      eyebrow={t("profile.security.title")}
      title={t("profile.security.mfa.enrollTitle")}
      description={t("profile.security.mfa.enrollHint")}
      submitLabel={t("profile.security.mfa.confirm")}
      onSubmit={() => void handleConfirm()}
      canSubmit={code.trim().length >= 6}
      submitting={confirmMfaEnrollment.isPending}
    >
      <div className="flex flex-col gap-4">
        {startMfaEnrollment.isPending || !enrollment ? (
          <p className="text-sm text-muted-foreground">{t("profile.security.mfa.loadingQr")}</p>
        ) : (
          <>
            <div className="flex justify-center">
              <img
                src={enrollment.qrCodeDataUrl}
                alt={t("profile.security.mfa.qrAlt")}
                className="h-48 w-48 rounded-lg border bg-white p-2"
              />
            </div>
            <div>
              <p className="mb-1 text-xs text-muted-foreground">
                {t("profile.security.mfa.manualEntry")}
              </p>
              <code className="block break-all rounded-md bg-muted/30 px-3 py-2 text-sm">
                {enrollment.secret}
              </code>
            </div>
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
          </>
        )}
      </div>
    </FormSurface>
  );
}
