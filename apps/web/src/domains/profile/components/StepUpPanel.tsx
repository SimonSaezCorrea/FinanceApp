import { useState } from "react";
import { useTranslation } from "react-i18next";

import { auth } from "@finance/contracts";

import { ApiRequestError } from "../../../shared/lib/apiClient";
import { serializeGetResponse, toGetOptions } from "../../../shared/lib/webauthn";
import { Button } from "../../../shared/ui/button";
import { ConfirmModal } from "../../../shared/ui/overlay";
import { Field } from "../../../shared/ui/field";
import { Input } from "../../../shared/ui/input";
import { useAuth } from "../../auth/hooks/useAuth";
import { usePasskeysQuery, useProfileMutations } from "../hooks/useProfile";

/**
 * Step-up before closing another session or "cerrar todas las demás" (2026-09-25): a TOTP code
 * and/or passkey when the account has a second factor configured (the password alone is refused
 * then — the server enforces the same; this only decides which field to show), the password
 * only when it has neither. On success, `onVerified` gets the instant until which the caller's
 * own session may act freely — the server re-checks this window on every close/revoke regardless.
 */
export function StepUpPanel({
  open,
  onOpenChange,
  onVerified,
}: Readonly<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onVerified: (verifiedUntil: Date) => void;
}>) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { data: passkeys } = usePasskeysQuery();
  const { stepUp, stepUpPasskeyOptions, stepUpPasskeyVerify } = useProfileMutations();
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [usingPasskey, setUsingPasskey] = useState(false);

  const methods = auth.stepUpMethodsFor({
    mfaEnabled: user?.mfaEnabled ?? false,
    passkeyCount: passkeys?.length ?? 0,
  });
  const hasTotp = methods.includes("totp");
  const hasPasskey = methods.includes("passkey");
  const passwordOnly = methods.length === 1 && methods[0] === "password";
  // What the modal's own confirm button submits — "none" when only a passkey is configured,
  // since that button has nothing to send; the passkey button below is the real action then.
  let primaryField: "password" | "totp" | "none" = "none";
  if (passwordOnly) primaryField = "password";
  else if (hasTotp) primaryField = "totp";

  let confirmDisabled = true;
  if (primaryField === "password") confirmDisabled = password.length === 0;
  else if (primaryField === "totp") confirmDisabled = !/^\d{6}$/.test(code);

  function reset() {
    setPassword("");
    setCode("");
    setError(null);
    setUsingPasskey(false);
  }

  function close(next: boolean) {
    if (!next) reset();
    onOpenChange(next);
  }

  async function submitCodeOrPassword() {
    setError(null);
    try {
      const { verifiedUntil } = passwordOnly
        ? await stepUp.mutateAsync({ method: "password", password })
        : await stepUp.mutateAsync({ method: "totp", code });
      close(false);
      onVerified(new Date(verifiedUntil));
    } catch (err) {
      const errCode = err instanceof ApiRequestError ? err.code : "INTERNAL_ERROR";
      setError(t(`errors.${errCode}`, { defaultValue: t("errors.INTERNAL_ERROR") }));
    }
  }

  async function submitPasskey() {
    setError(null);
    setUsingPasskey(true);
    try {
      const { options } = await stepUpPasskeyOptions.mutateAsync();
      const credential = await navigator.credentials.get(toGetOptions(options));
      if (!credential) throw new Error("passkey ceremony cancelled");
      const { verifiedUntil } = await stepUpPasskeyVerify.mutateAsync(
        serializeGetResponse(credential),
      );
      close(false);
      onVerified(new Date(verifiedUntil));
    } catch (err) {
      const errCode = err instanceof ApiRequestError ? err.code : null;
      setError(errCode ? t(`errors.${errCode}`) : t("profile.security.stepUp.passkeyFailed"));
    } finally {
      setUsingPasskey(false);
    }
  }

  const submitting = stepUp.isPending || stepUpPasskeyVerify.isPending || usingPasskey;

  return (
    <ConfirmModal
      open={open}
      onOpenChange={close}
      onConfirm={() => void submitCodeOrPassword()}
      title={t("profile.security.stepUp.title")}
      description={t("profile.security.stepUp.description")}
      confirmLabel={t("profile.security.stepUp.confirm")}
      destructive={false}
      loading={submitting}
      confirmDisabled={confirmDisabled}
    >
      <div className="flex flex-col gap-4">
        {passwordOnly ? (
          <Field
            label={t("profile.security.stepUp.passwordLabel")}
            htmlFor="step-up-password"
            error={hasPasskey ? undefined : error}
          >
            <Input
              id="step-up-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>
        ) : hasTotp ? (
          <Field
            label={t("profile.security.stepUp.codeLabel")}
            htmlFor="step-up-code"
            error={hasPasskey ? undefined : error}
          >
            <Input
              id="step-up-code"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            />
          </Field>
        ) : null}
        {hasPasskey ? (
          <div className="flex flex-col gap-1.5">
            <Button
              type="button"
              variant="outline"
              onClick={() => void submitPasskey()}
              disabled={submitting}
            >
              {t("profile.security.stepUp.usePasskey")}
            </Button>
            {error ? <p className="text-xs text-destructive">{error}</p> : null}
          </div>
        ) : null}
      </div>
    </ConfirmModal>
  );
}
