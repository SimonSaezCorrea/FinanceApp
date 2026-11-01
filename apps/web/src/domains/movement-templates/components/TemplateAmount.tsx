import { useTranslation } from "react-i18next";

import type { movementTemplates } from "@finance/contracts";
import { formatMoney } from "@finance/money";

import { cn } from "@finance/ui/src/shared/lib/cn";

/** A template's amount as a movement shows it (signed, red/green), or "Monto libre". */
export function TemplateAmount({
  template,
  className,
}: Readonly<{ template: movementTemplates.MovementTemplate; className?: string }>) {
  const { t, i18n } = useTranslation();
  if (!template.amount || !template.currency) {
    return (
      <span className={cn("shrink-0 text-muted-foreground", className)}>
        {t("templates.freeAmount")}
      </span>
    );
  }
  const income = template.type === "INCOME";
  return (
    <span
      className={cn(
        "shrink-0 tabular-nums",
        income ? "text-success" : "text-destructive",
        className,
      )}
    >
      {income ? "+" : "−"}
      {formatMoney(template.amount, { currency: template.currency, locale: i18n.language })}
    </span>
  );
}
