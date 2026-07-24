import { useState } from "react";
import { useTranslation } from "react-i18next";

import { useAuth } from "../../auth/hooks/useAuth";
import { CollapsibleSection } from "../../../shared/ui/collapsible-section";
import { Switch } from "../../../shared/ui/switch";
import { useProfileMutations } from "../hooks/useProfile";

export function NotificationsSection() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { updatePreferences } = useProfileMutations();
  // Local-only — no notification-delivery capability exists yet (FR-008); never persisted.
  const [installmentDue, setInstallmentDue] = useState(true);
  const [monthlySummary, setMonthlySummary] = useState(true);
  const [spendAlerts, setSpendAlerts] = useState(false);

  if (!user) return null;

  return (
    <CollapsibleSection title={t("profile.notifications.title")}>
      <div className="flex items-center justify-between border-b py-3">
        <span className="text-sm">{t("profile.notifications.installmentDue")}</span>
        <Switch
          checked={installmentDue}
          onCheckedChange={setInstallmentDue}
          aria-label={t("profile.notifications.installmentDue")}
        />
      </div>
      <div className="flex items-center justify-between border-b py-3">
        <span className="text-sm">{t("profile.notifications.monthlySummary")}</span>
        <Switch
          checked={monthlySummary}
          onCheckedChange={setMonthlySummary}
          aria-label={t("profile.notifications.monthlySummary")}
        />
      </div>
      <div className="flex items-center justify-between border-b py-3">
        <span className="text-sm">{t("profile.notifications.spendAlerts")}</span>
        <Switch
          checked={spendAlerts}
          onCheckedChange={setSpendAlerts}
          aria-label={t("profile.notifications.spendAlerts")}
        />
      </div>
      <div className="pt-3">
        <div className="mb-2 flex items-center justify-between text-xs">
          <span className="text-muted-foreground">
            {t("profile.notifications.budgetThreshold")}
          </span>
          <span className="font-semibold text-accent">
            {t("profile.notifications.budgetThresholdValue", {
              pct: user.budgetAlertThreshold ?? 80,
            })}
          </span>
        </div>
        <input
          type="range"
          min={1}
          max={100}
          value={user.budgetAlertThreshold ?? 80}
          onChange={(e) =>
            updatePreferences.mutate({ budgetAlertThreshold: Number(e.target.value) })
          }
          className="h-1.5 w-full cursor-pointer appearance-none rounded-full accent-accent"
          style={{
            background: `linear-gradient(to right, hsl(var(--accent)) ${user.budgetAlertThreshold ?? 80}%, hsl(var(--muted)) ${user.budgetAlertThreshold ?? 80}%)`,
          }}
          aria-label={t("profile.notifications.budgetThreshold")}
        />
      </div>
    </CollapsibleSection>
  );
}
