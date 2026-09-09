import { CalendarClock, TrendingUp } from "lucide-react";
import { useTranslation } from "react-i18next";

import type { savings } from "@finance/contracts";
import { formatMoney } from "@finance/money";

import { Card } from "../../../shared/ui/card";
import { goalVisual } from "../lib/goalVisual";
import { bestPaceGoal, goalLeft, goalStatus, upcomingDeadlines } from "../lib/savingsMetrics";

interface Props {
  goals: savings.SavingsGoal[];
  currency: string;
}

/**
 * Desktop-only second column (`ASIDE_MIN_WIDTH`, same threshold the account
 * detail's own aside uses) — "Próximo vencimiento" and "Mejor ritmo", derived
 * straight from what the API already exposes per goal, never a new figure of
 * its own. No quick-actions card here on purpose: the page header and each
 * goal row already offer those.
 */
export function SavingsInsightsRail({ goals, currency }: Readonly<Props>) {
  const { t, i18n } = useTranslation();
  const now = new Date();
  const money = (v: string) => formatMoney(v, { locale: i18n.language, currency });

  const deadlines = upcomingDeadlines(goals, now);
  const pacer = bestPaceGoal(goals);
  const pacerStatus = pacer ? goalStatus(pacer, now) : null;
  const aheadMonths =
    pacerStatus?.kind === "onTrack" && pacerStatus.deadlineMonths !== null
      ? pacerStatus.deadlineMonths - pacerStatus.etaMonths
      : 0;

  if (deadlines.length === 0 && !pacer) return null;

  return (
    <div className="flex w-[300px] shrink-0 flex-col gap-4">
      {deadlines.length > 0 ? (
        <Card className="flex flex-col gap-3 rounded-[9.6px] p-[18px_20px]">
          <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <CalendarClock className="h-[15px] w-[15px] text-primary" aria-hidden />
            {t("savings.insights.upcoming")}
          </p>
          <div className="flex flex-col">
            {deadlines.map(({ goal, monthsLeft }) => {
              const visual = goalVisual(goal.id, goal.color);
              const Icon = visual.icon;
              return (
                <div
                  key={goal.id}
                  className="flex items-center gap-2.5 border-t border-border py-2 first:border-t-0 first:pt-0.5"
                >
                  <span className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full bg-chip text-muted-foreground">
                    <Icon className="h-[15px] w-[15px]" style={{ color: visual.color }} />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-medium text-foreground">
                      {goal.title}
                    </p>
                    <p className="truncate text-[11.5px] text-muted-foreground">
                      {t("savings.insights.dueIn", { count: monthsLeft })} ·{" "}
                      {t("savings.insights.missing", {
                        amount: money(goalLeft(goal.savedAmount, goal.targetAmount)),
                      })}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      ) : null}

      {pacer ? (
        <Card className="flex flex-col gap-3 rounded-[9.6px] p-[18px_20px]">
          <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <TrendingUp className="h-[15px] w-[15px] text-primary" aria-hidden />
            {t("savings.insights.bestPace")}
          </p>
          <div className="flex items-center gap-2.5">
            <span className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full bg-chip text-muted-foreground">
              {(() => {
                const visual = goalVisual(pacer.id, pacer.color);
                const Icon = visual.icon;
                return <Icon className="h-[15px] w-[15px]" style={{ color: visual.color }} />;
              })()}
            </span>
            <div className="min-w-0">
              <p className="truncate text-[13px] font-medium text-foreground">{pacer.title}</p>
              <p className="truncate text-[11.5px] text-muted-foreground">
                {t("savings.insights.paceValue", { amount: money(pacer.pace) })}
                {aheadMonths > 0
                  ? ` · ${t("savings.insights.ahead", { count: aheadMonths })}`
                  : ""}
              </p>
            </div>
          </div>
        </Card>
      ) : null}
    </div>
  );
}
