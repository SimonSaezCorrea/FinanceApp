import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import type { movementTemplates } from "@finance/contracts";

import { ApiRequestError } from "@finance/client";
import { ConfirmModal } from "@finance/ui/src/shared/ui/overlay";
import { FormSwitchField, FormTextField } from "../../../shared/ui/form";
import { useMovementTemplateMutations } from "../hooks/useMovementTemplates";

/**
 * "Guardar como plantilla" (specs/037, US3): asks a name and whether to keep the amount,
 * then creates the template from what the movement form holds. The movement form stays
 * open and untouched — the movement itself is not saved by this.
 */
export function SaveAsTemplateDialog({
  open,
  onOpenChange,
  hasAmount,
  defaultName,
  buildBody,
}: Readonly<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The form has an amount typed (otherwise "keep the amount" isn't offered). */
  hasAmount: boolean;
  /** Suggested name: the movement's description. */
  defaultName: string;
  buildBody: (name: string, keepAmount: boolean) => movementTemplates.SaveMovementTemplate;
}>) {
  const { t } = useTranslation();
  const { create } = useMovementTemplateMutations();
  const [name, setName] = useState("");
  const [keepAmount, setKeepAmount] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- prefill on open
    setName(defaultName.trim());
    setKeepAmount(false);
    setError(null);
  }, [open, defaultName]);

  const confirm = () => {
    create.mutate(buildBody(name, hasAmount && keepAmount), {
      onSuccess: () => {
        toast.success(t("templates.toast.created"));
        onOpenChange(false);
      },
      onError: (err: unknown) => {
        const code = err instanceof ApiRequestError ? err.code : "INTERNAL_ERROR";
        setError(t(`errors.${code}`, { defaultValue: t("errors.INTERNAL_ERROR") }));
      },
    });
  };

  return (
    <ConfirmModal
      open={open}
      onOpenChange={onOpenChange}
      onConfirm={confirm}
      title={t("templates.saveAs.title")}
      description={t("templates.saveAs.description")}
      confirmLabel={t("templates.saveAs.confirm")}
      destructive={false}
      loading={create.isPending}
      confirmDisabled={name.trim().length === 0}
    >
      <div className="flex flex-col">
        <FormTextField
          id="save-as-template-name"
          label={t("templates.form.name")}
          value={name}
          onChange={(v) => {
            setName(v);
            setError(null);
          }}
          placeholder={t("templates.form.namePlaceholder")}
          error={error}
          autoFocus
        />
        {hasAmount ? (
          <FormSwitchField
            label={t("templates.saveAs.keepAmount")}
            checked={keepAmount}
            onChange={setKeepAmount}
          />
        ) : null}
      </div>
    </ConfirmModal>
  );
}
