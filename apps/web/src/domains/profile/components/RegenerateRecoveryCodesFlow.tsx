import { useState } from "react";
import { useTranslation } from "react-i18next";

import { ApiRequestError } from "@finance/client";
import { ConfirmModal, FormSurface } from "@finance/ui/src/shared/ui/overlay";
import { toast } from "sonner";

import { useProfileMutations } from "../hooks/useProfile";
import { useStepUp } from "../hooks/useStepUp";
import { RecoveryCodesList } from "./RecoveryCodesList";

/**
 * "Generar códigos nuevos" (specs/040 US1): confirm → (step-up when the server asks) → the 10 new
 * codes, shown once. The server spends the step-up, so a second click can't create another set
 * behind the one on screen. `onSpentStepUp` lets the caller forget its own "recently verified"
 * shortcut, which the regeneration just used up.
 */
export function RegenerateRecoveryCodesFlow({
  open,
  onOpenChange,
  onSpentStepUp,
}: Readonly<{ open: boolean; onOpenChange: (open: boolean) => void; onSpentStepUp?: () => void }>) {
  const { t } = useTranslation();
  const { regenerateRecoveryCodes } = useProfileMutations();
  const [codes, setCodes] = useState<string[] | null>(null);
  const { needsStepUp, stepUpPanel } = useStepUp(t("profile.security.mfa.recovery.stepUpHint"));

  function run() {
    regenerateRecoveryCodes.mutate(undefined, {
      onSuccess: (res) => {
        onSpentStepUp?.();
        onOpenChange(false);
        setCodes(res.recoveryCodes);
      },
      onError: (error) => {
        if (needsStepUp(error, run)) return;
        const code = error instanceof ApiRequestError ? error.code : "INTERNAL_ERROR";
        toast.error(t(`errors.${code}`, { defaultValue: t("errors.INTERNAL_ERROR") }));
      },
    });
  }

  return (
    <>
      <ConfirmModal
        open={open}
        onOpenChange={onOpenChange}
        title={t("profile.security.mfa.recovery.confirmTitle")}
        description={t("profile.security.mfa.recovery.confirmBody")}
        confirmLabel={t("profile.security.mfa.recovery.confirm")}
        loading={regenerateRecoveryCodes.isPending}
        onConfirm={run}
      />
      {stepUpPanel}
      <FormSurface
        open={codes !== null}
        onOpenChange={(next) => {
          if (!next) setCodes(null);
        }}
        mode="create"
        surface="panel"
        eyebrow={t("profile.security.title")}
        title={t("profile.security.mfa.recovery.doneTitle")}
        description={t("profile.security.mfa.recovery.doneHint")}
        submitLabel={t("profile.security.mfa.done")}
        onSubmit={() => setCodes(null)}
        hideCancel
      >
        {codes ? <RecoveryCodesList codes={codes} /> : null}
      </FormSurface>
    </>
  );
}
