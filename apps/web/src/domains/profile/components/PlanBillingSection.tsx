import { CreditCard } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Badge } from "../../../shared/ui/badge";
import { Button } from "../../../shared/ui/button";
import { CollapsibleSection } from "../../../shared/ui/collapsible-section";

interface UsageBar {
  key: string;
  used: number;
  limit: number;
}

// Placeholder data — there is no plan/billing/payment system in this app yet (see PENDING.md).
const USAGE: UsageBar[] = [
  { key: "accounts", used: 6, limit: 10 },
  { key: "categories", used: 8, limit: 15 },
];

export function PlanBillingSection() {
  const { t } = useTranslation();

  return (
    <CollapsibleSection
      title={
        <span className="flex items-center gap-2">
          {t("profile.billing.title")}
          <Badge variant="brand" className="text-[10px]">
            {t("profile.billing.planFree")}
          </Badge>
        </span>
      }
    >
      <div className="mb-4 flex flex-col gap-3">
        {USAGE.map((u) => {
          const pct = Math.min(100, Math.round((u.used / u.limit) * 100));
          return (
            <div key={u.key}>
              <div className="mb-1 flex justify-between text-xs">
                <span className="text-muted-foreground">{t(`profile.billing.usage.${u.key}`)}</span>
                <span className="tabular-nums">
                  {u.used} / {u.limit}
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-muted">
                <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
              </div>
            </div>
          );
        })}
      </div>

      <div className="mb-3 flex items-center justify-between gap-3 rounded-lg border border-accent bg-accent/5 p-3.5">
        <div>
          <div className="text-xs font-semibold">{t("profile.billing.upsellTitle")}</div>
          <div className="mt-0.5 text-xs text-muted-foreground">{t("profile.billing.upsellBody")}</div>
        </div>
        <Button size="sm" variant="accent" className="shrink-0" disabled title={t("profile.comingSoon")}>
          {t("profile.billing.upsellCta")}
        </Button>
      </div>

      <div className="flex items-center justify-between border-t py-3">
        <span className="flex items-center gap-2 text-sm">
          <CreditCard className="h-4 w-4 text-muted-foreground" aria-hidden />
          {t("profile.billing.paymentMethod")}
        </span>
        <Button variant="outline" size="sm" disabled title={t("profile.comingSoon")}>
          {t("profile.billing.change")}
        </Button>
      </div>
      <div className="flex items-center justify-between py-3">
        <span className="text-sm">{t("profile.billing.invoiceHistory")}</span>
        <Button variant="outline" size="sm" disabled title={t("profile.comingSoon")}>
          {t("profile.billing.view")}
        </Button>
      </div>
    </CollapsibleSection>
  );
}
