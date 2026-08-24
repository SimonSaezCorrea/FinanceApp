import type { installments } from "@finance/contracts";
import { useTranslation } from "react-i18next";

import { Badge, type BadgeProps } from "../../../shared/ui/badge";

/**
 * A plan's state as one badge, so the list, the cards and the panel cannot describe
 * the same plan differently.
 *
 * `PARTIALLY_PAID` is `warning`, not `success`: the plan looks finished (no unpaid
 * instalment left in the ordinary sense) but money is still owed, and that is exactly
 * the case the user must not skim past.
 */
const VARIANTS: Record<installments.InstallmentPlanStatus, BadgeProps["variant"]> = {
  OVERDUE: "danger",
  DUE_SOON: "accent",
  ON_TRACK: "neutral",
  PARTIALLY_PAID: "warning",
  PAID: "success",
};

interface PlanStatusBadgeProps {
  status: installments.InstallmentPlanStatus;
  /** The next instalment's due date, shown inside the badge when there is one. */
  nextDueDate: string | null;
}

/**
 * The same wording the badge shows, as plain text — for a context that needs
 * the words but not the pill (a phone row's single-line subtitle, folding the
 * status in next to the progress fraction instead of stacking it as its own
 * coloured element).
 */
export function planStatusText(
  status: installments.InstallmentPlanStatus,
  nextDueDate: string | null,
  t: (key: string, opts?: Record<string, unknown>) => string,
  locale: string,
): string {
  const date =
    nextDueDate === null
      ? null
      : new Date(nextDueDate).toLocaleDateString(locale, { day: "numeric", month: "short" });

  return date === null
    ? t(`installments.status.${status}`)
    : t(`installments.statusWithDate.${status}`, { date });
}

export function PlanStatusBadge({ status, nextDueDate }: Readonly<PlanStatusBadgeProps>) {
  const { t, i18n } = useTranslation();

  return (
    <Badge variant={VARIANTS[status]}>
      {planStatusText(status, nextDueDate, t, i18n.language)}
    </Badge>
  );
}
