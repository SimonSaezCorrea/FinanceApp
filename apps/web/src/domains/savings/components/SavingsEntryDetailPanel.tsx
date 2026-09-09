import { Pencil, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";

import type { accounts as accountsContract, savings } from "@finance/contracts";
import { formatMoney } from "@finance/money";

import { useLastNonNull } from "../../../shared/lib/useLastNonNull";
import { Button } from "../../../shared/ui/button";
import { DetailRow } from "../../../shared/ui/detail-row";
import { SidePanel } from "../../../shared/ui/overlay";

interface Props {
  readonly entry: savings.SavingsEntry | null;
  readonly goals: savings.SavingsGoal[];
  readonly accounts: accountsContract.BankAccount[];
  readonly onOpenChange: (open: boolean) => void;
  readonly onEdit: () => void;
  readonly onDelete: () => void;
}

/**
 * Detail of a single aporte — goal-linked or ahorro libre, same shell either
 * way. Opened from `FreeSavingsSection`'s list and from
 * `SavingsGoalDetailPanel`'s own history, which is why it's elevated
 * (`z-[1500]`) the same way `SavingsEntryFormPanel`/`SavingsGoalClosePanel`
 * already are — it can stack on top of an open goal detail panel.
 */
export function SavingsEntryDetailPanel({
  entry,
  goals,
  accounts,
  onOpenChange,
  onEdit,
  onDelete,
}: Props) {
  const { t, i18n } = useTranslation();
  // Retained through the close so the panel can play its exit animation
  // instead of vanishing the instant `entry` clears.
  const e = useLastNonNull(entry);
  if (e === null) return null;

  const goal = e.savingsGoalId ? (goals.find((g) => g.id === e.savingsGoalId) ?? null) : null;
  const account = e.bankAccountId ? (accounts.find((a) => a.id === e.bankAccountId) ?? null) : null;
  const money = (v: string) => formatMoney(v, { locale: i18n.language, currency: e.currency });

  return (
    <SidePanel
      open={entry !== null}
      onOpenChange={onOpenChange}
      eyebrow={t("savings.entryDetail.eyebrow")}
      title={e.title ?? e.note ?? t("savings.detail.entryFallback")}
      description={goal ? goal.title : t("savings.entryDetail.noGoal")}
      className="z-[1500]"
      footer={
        <div className="flex items-center justify-end gap-2">
          <Button variant="outline" onClick={onEdit}>
            <Pencil className="h-4 w-4" aria-hidden />
            {t("common.edit")}
          </Button>
          <Button variant="ghost" aria-label={t("common.delete")} onClick={onDelete}>
            <Trash2 className="h-4 w-4 text-destructive" aria-hidden />
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-1 border-b border-border pb-3">
          <span className="text-xs text-muted-foreground">{t("savings.entryDetail.amount")}</span>
          <span className="text-3xl font-semibold tabular-nums text-success">
            +{money(e.amount)}
          </span>
        </div>

        <div className="flex flex-col">
          <DetailRow
            label={t("savings.entryDetail.date")}
            value={new Date(e.contributedAt).toLocaleDateString(i18n.language, {
              day: "numeric",
              month: "short",
              year: "numeric",
            })}
          />
          <DetailRow
            label={t("savings.entryDetail.goal")}
            value={goal ? goal.title : t("savings.entryDetail.noGoal")}
          />
          <DetailRow
            label={t("savings.entryDetail.account")}
            value={account?.name ?? t("savings.entryDetail.noAccount")}
          />
          <DetailRow
            label={t("savings.entryDetail.note")}
            value={e.note ?? t("savings.entryDetail.noNote")}
          />
        </div>
      </div>
    </SidePanel>
  );
}
