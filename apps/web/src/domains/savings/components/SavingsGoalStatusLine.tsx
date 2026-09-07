import { CircleCheck, ClockAlert, TrendingDown, TrendingUp } from "lucide-react";
import { useTranslation } from "react-i18next";

import type { savings } from "@finance/contracts";
import { formatMoney } from "@finance/money";

import { cn } from "../../../shared/lib/cn";
import type { SavingsGoalStatus } from "../lib/savingsMetrics";

interface Props {
  status: SavingsGoalStatus;
  goal: Pick<savings.SavingsGoal, "deadline" | "targetAmount">;
  currency: string;
  className?: string;
}

/** Línea de estado (ícono + texto + color) compartida por la fila de meta y
 * el panel de detalle — README §Estados de meta. */
export function SavingsGoalStatusLine({ status, goal, currency, className }: Readonly<Props>) {
  const { t, i18n } = useTranslation();
  const money = (v: string) => formatMoney(v, { locale: i18n.language, currency });
  const dateLabel = (iso: string) =>
    new Date(iso).toLocaleDateString(i18n.language, {
      day: "numeric",
      month: "short",
      year: "numeric",
    });

  let icon: React.ReactNode = null;
  let text: string;
  let toneClass = "text-muted-foreground";

  switch (status.kind) {
    case "complete":
      icon = <CircleCheck className="h-3 w-3" aria-hidden />;
      text = t("savings.status.complete", { amount: money(goal.targetAmount) });
      toneClass = "text-success";
      break;
    case "overdue":
      icon = <ClockAlert className="h-3 w-3" aria-hidden />;
      text = t("savings.status.overdue", {
        date: goal.deadline ? dateLabel(goal.deadline) : "",
        amount: money(status.missing),
      });
      toneClass = "text-destructive";
      break;
    case "shortOnPace":
      icon = <TrendingDown className="h-3 w-3" aria-hidden />;
      text = t("savings.status.shortOnPace", {
        eta: status.etaLabel,
        deadline: goal.deadline ? dateLabel(goal.deadline) : "",
        needed: money(status.neededPerMonth),
      });
      toneClass = "text-warning";
      break;
    case "onTrack":
      icon = <TrendingUp className="h-3 w-3" aria-hidden />;
      text = goal.deadline
        ? t("savings.status.onTrackWithDeadline", {
            eta: status.etaLabel,
            deadline: dateLabel(goal.deadline),
          })
        : t("savings.status.onTrackNoDeadline", { eta: status.etaLabel });
      break;
    case "noContributions":
      text = t("savings.status.noContributions");
      break;
  }

  return (
    <div
      className={cn(
        "mt-0.5 flex items-start gap-1 text-xs leading-[1.4] text-pretty",
        toneClass,
        className,
      )}
    >
      {icon}
      <span>{text}</span>
    </div>
  );
}
