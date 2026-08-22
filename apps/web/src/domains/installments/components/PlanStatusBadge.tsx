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

export function PlanStatusBadge({ status, nextDueDate }: Readonly<PlanStatusBadgeProps>) {
  const { t, i18n } = useTranslation();

  const date =
    nextDueDate === null
      ? null
      : new Date(nextDueDate).toLocaleDateString(i18n.language, {
          day: "numeric",
          month: "short",
        });

  return (
    <Badge variant={VARIANTS[status]}>
      {date === null
        ? t(`installments.status.${status}`)
        : t(`installments.statusWithDate.${status}`, { date })}
    </Badge>
  );
}
