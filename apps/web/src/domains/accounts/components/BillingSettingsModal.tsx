import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import type { accounts } from "@finance/contracts";

import { ApiRequestError } from "../../../shared/lib/apiClient";
import { Button } from "../../../shared/ui/button";
import { Dialog } from "../../../shared/ui/dialog";
import { Field } from "../../../shared/ui/field";
import { Input } from "../../../shared/ui/input";
import { Segmented } from "../../../shared/ui/segmented";
import { useAccountMutations } from "../hooks/useAccounts";

/** Dedicated modal for the two "advanced" billing settings (billing day + payment
 * method) — reached from the reminder badge on the account detail view, instead of
 * routing through the full account-edit form. */
export function BillingSettingsModal({
  account,
  open,
  onOpenChange,
}: Readonly<{
  account: accounts.BankAccount;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}>) {
  const { t } = useTranslation();
  const { update } = useAccountMutations();
  const [billingCycleDay, setBillingCycleDay] = useState(account.billingCycleDay?.toString() ?? "");
  const [paymentMethod, setPaymentMethod] = useState<accounts.BillingPaymentMethod>(
    account.paymentMethod,
  );

  function submit() {
    update.mutate(
      {
        id: account.id,
        body: {
          billingCycleDay: billingCycleDay ? Number(billingCycleDay) : null,
          paymentMethod,
        },
      },
      {
        onSuccess: () => onOpenChange(false),
        onError: (err) => {
          const code = err instanceof ApiRequestError ? err.code : "INTERNAL_ERROR";
          toast.error(t(`errors.${code}`, { defaultValue: t("errors.INTERNAL_ERROR") }));
        },
      },
    );
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={t("accounts.detail.billingSettingsTitle")}
      description={t("accounts.detail.billingSettingsSubtitle")}
      className="max-w-md"
    >
      <div className="flex flex-col gap-4">
        <Field label={t("accounts.form.billingCycleDay")}>
          <Input
            id="billing-modal-day"
            inputMode="numeric"
            placeholder={t("accounts.form.billingCycleDayPlaceholder")}
            value={billingCycleDay}
            onChange={(e) => {
              const digits = e.target.value.replace(/\D/g, "").slice(0, 2);
              setBillingCycleDay(digits && Number(digits) > 28 ? "28" : digits);
            }}
            aria-label={t("accounts.form.billingCycleDay")}
          />
        </Field>
        <p className="-mt-2 text-xs text-muted-foreground">{t("accounts.form.billingCycleDayHint")}</p>

        <Field label={t("accounts.form.paymentMethod")}>
          <Segmented
            value={paymentMethod}
            onChange={setPaymentMethod}
            options={[
              { value: "MANUAL", label: t("accounts.form.paymentMethodManual") },
              {
                value: "AUTOMATIC",
                label: t("accounts.form.paymentMethodAutomatic"),
                disabled: true,
                disabledReason: t("accounts.form.paymentMethodAutomaticLocked"),
              },
            ]}
            aria-label={t("accounts.form.paymentMethod")}
          />
        </Field>

        <div className="mt-2 flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </Button>
          <Button onClick={submit} disabled={update.isPending}>
            {t("accounts.actions.save")}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
