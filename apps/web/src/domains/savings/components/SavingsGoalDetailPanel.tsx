import { Archive, CircleX, Pencil, PlusCircle, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";

import type { savings } from "@finance/contracts";
import { formatMoney } from "@finance/money";

import { useLastNonNull } from "../../../shared/lib/useLastNonNull";
import { Button } from "../../../shared/ui/button";
import { DetailRow } from "../../../shared/ui/detail-row";
import { SidePanel } from "../../../shared/ui/overlay";
import { goalVisual } from "../lib/goalVisual";
import { goalPct, isGoalCloseable, isGoalComplete, goalStatus } from "../lib/savingsMetrics";
import { SavingsGoalStatusLine } from "./SavingsGoalStatusLine";

interface Props {
  goal: savings.SavingsGoal | null;
  entries: savings.SavingsEntry[];
  currency: string;
  onOpenChange: (open: boolean) => void;
  onEdit: () => void;
  onContribute: () => void;
  onClose: () => void;
  onDelete: () => void;
  onSelectEntry: (entry: savings.SavingsEntry) => void;
}

/** Panel de detalle de una meta — README §2. */
export function SavingsGoalDetailPanel({
  goal,
  entries,
  currency,
  onOpenChange,
  onEdit,
  onContribute,
  onClose,
  onDelete,
  onSelectEntry,
}: Readonly<Props>) {
  const { t, i18n } = useTranslation();
  // Retained through the close so the panel can play its exit animation
  // instead of vanishing the instant `goal` clears.
  const g = useLastNonNull(goal);
  if (g === null) return null;

  const now = new Date();
  const status = goalStatus(g, now);
  const visual = goalVisual(g.id, g.color);
  const Icon = visual.icon;
  const pct = goalPct(g.savedAmount, g.targetAmount);
  const closeable = isGoalCloseable(status);
  const money = (v: string) => formatMoney(v, { locale: i18n.language, currency });
  const goalEntries = entries
    .filter((e) => e.savingsGoalId === g.id)
    .sort((a, b) => b.contributedAt.localeCompare(a.contributedAt));

  return (
    <SidePanel
      open={goal !== null}
      onOpenChange={onOpenChange}
      eyebrow={t("savings.detail.eyebrow")}
      title={
        <span className="flex items-center gap-3">
          <span
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-chip text-muted-foreground"
            aria-hidden
          >
            <Icon className="h-5 w-5" />
          </span>
          <span className="text-[22px] font-semibold tracking-tight">{g.title}</span>
        </span>
      }
      footer={
        <div className="flex items-center gap-2">
          <Button variant="accent" className="flex-1" onClick={onContribute}>
            <PlusCircle className="h-4 w-4" aria-hidden />
            {t("savings.row.registerContribution")}
          </Button>
          {closeable ? (
            <Button variant="outline" onClick={onClose}>
              {isGoalComplete(status) ? (
                <Archive className="h-4 w-4" aria-hidden />
              ) : (
                <CircleX className="h-4 w-4" aria-hidden />
              )}
              {t(
                isGoalComplete(status)
                  ? "savings.row.closeComplete"
                  : "savings.row.closeIncomplete",
              )}
            </Button>
          ) : null}
          <Button variant="outline" onClick={onEdit}>
            <Pencil className="h-4 w-4" aria-hidden />
            {t("savings.row.editGoal")}
          </Button>
          <Button variant="ghost" aria-label={t("common.delete")} onClick={onDelete}>
            <Trash2 className="h-4 w-4 text-destructive" aria-hidden />
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-6">
        <SavingsGoalStatusLine status={status} goal={g} currency={currency} className="text-[13px]" />

        <div className="flex flex-col gap-3">
          <div className="h-[10px] w-full rounded-full bg-track">
            <div
              className="h-full rounded-full"
              style={{ width: `${pct}%`, backgroundColor: visual.color }}
            />
          </div>
          <div className="flex justify-between gap-4">
            <Stat label={t("savings.detail.saved")} value={money(g.savedAmount)} />
            <Stat label={t("savings.detail.target")} value={money(g.targetAmount)} muted />
            <Stat
              label={t("savings.detail.missing")}
              value={money(
                status.kind === "complete" ? "0" : status.kind === "overdue" ? status.missing : "0",
              )}
              tone={status.kind === "complete" ? "success" : undefined}
            />
          </div>
        </div>

        <div className="flex flex-col">
          <DetailRow
            label={t("savings.detail.deadline")}
            value={
              g.deadline
                ? new Date(g.deadline).toLocaleDateString(i18n.language, {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })
                : t("savings.detail.noDeadline")
            }
          />
          <DetailRow
            label={t("savings.detail.pace")}
            value={t("savings.detail.paceValue", { amount: money(g.pace) })}
          />
          <DetailRow
            label={t("savings.detail.projection")}
            value={
              status.kind === "onTrack" || status.kind === "shortOnPace"
                ? t("savings.detail.projectionValue", { eta: status.etaLabel })
                : t("savings.detail.noProjection")
            }
          />
          <DetailRow label={t("savings.detail.currency")} value={g.currency} />
        </div>

        <section className="flex flex-col gap-1">
          <h3 className="text-[13px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
            {t("savings.detail.history")}
          </h3>
          {goalEntries.length > 0 ? (
            <ul className="flex flex-col">
              {goalEntries.map((e) => (
                <li key={e.id}>
                  <button
                    type="button"
                    onClick={() => onSelectEntry(e)}
                    className="flex w-full items-center justify-between gap-3 border-t border-border py-2.5 text-left hover:bg-accent/5"
                  >
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate text-sm text-foreground">
                        {e.title ?? e.note ?? t("savings.detail.entryFallback")}
                      </span>
                      <span className="truncate text-xs text-muted-foreground">
                        {[
                          e.title && e.note ? e.note : null,
                          new Date(e.contributedAt).toLocaleDateString(i18n.language, {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          }),
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </span>
                    <span className="shrink-0 text-sm font-medium tabular-nums text-success">
                      +{money(e.amount)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="py-2 text-sm text-muted-foreground">{t("savings.detail.historyEmpty")}</p>
          )}
        </section>
      </div>
    </SidePanel>
  );
}

function Stat({
  label,
  value,
  muted,
  tone,
}: Readonly<{ label: string; value: string; muted?: boolean; tone?: "success" }>) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span
        className={`text-base font-semibold tabular-nums ${
          tone === "success" ? "text-success" : muted ? "text-muted-foreground" : "text-foreground"
        }`}
      >
        {value}
      </span>
    </div>
  );
}
