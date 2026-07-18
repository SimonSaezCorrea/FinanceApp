import { Pencil, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";

import type { accounts, transactions } from "@finance/contracts";
import { formatMoney } from "@finance/money";

import { Badge } from "../../../shared/ui/badge";
import { Button } from "../../../shared/ui/button";
import { CollapsibleSection } from "../../../shared/ui/collapsible-section";
import { Dialog } from "../../../shared/ui/dialog";
import { categoryIcon } from "../lib/categoryIcons";

function formatDate(iso: string, locale: string): string {
  return new Date(iso).toLocaleDateString(locale, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function DetailRow({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div className="flex items-center justify-between gap-4 border-b py-2 last:border-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium">{value}</span>
    </div>
  );
}

interface Props {
  transaction: transactions.Transaction | null;
  accounts: accounts.BankAccount[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEdit?: (tx: transactions.Transaction) => void;
  onDelete?: (tx: transactions.Transaction) => void;
}

/** Read-only view of a single movement's full details (opened by clicking its row). */
export function TransactionDetailModal({
  transaction,
  accounts,
  open,
  onOpenChange,
  onEdit,
  onDelete,
}: Readonly<Props>) {
  const { t, i18n } = useTranslation();

  if (!transaction) return null;
  const tx = transaction;

  const account = tx.bankAccountId ? accounts.find((a) => a.id === tx.bankAccountId) : undefined;
  const card = tx.cardId ? account?.cards.find((c) => c.id === tx.cardId) : undefined;
  const isIncome = tx.type === "INCOME";
  const Icon = categoryIcon(tx.category);

  const extraDetails = [
    { label: t("transactions.form.emisor"), value: tx.emisor },
    { label: t("transactions.form.receptor"), value: tx.receptor },
    { label: t("transactions.form.lugar"), value: tx.lugar },
    { label: t("transactions.form.observation"), value: tx.observation },
  ];

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={tx.description ?? t(`transactions.type.${tx.type}`)}
      description={formatDate(tx.occurredAt, i18n.language)}
      className="max-w-md"
    >
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <span
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${
              isIncome ? "bg-success/15 text-success" : "bg-muted text-muted-foreground"
            }`}
          >
            <Icon className="h-5 w-5" aria-hidden />
          </span>
          <div className="flex flex-col gap-1">
            <span
              className={`text-2xl font-semibold tabular-nums ${
                isIncome ? "text-success" : "text-destructive"
              }`}
            >
              {isIncome ? "+" : "−"}
              {formatMoney(tx.amount, { currency: tx.currency, locale: i18n.language })}
            </span>
            <Badge variant={isIncome ? "success" : "danger"} className="w-fit">
              {t(`transactions.type.${tx.type}`)}
            </Badge>
          </div>
        </div>

        <div className="flex flex-col">
          <DetailRow
            label={t("transactions.form.category")}
            value={tx.category ?? t("transactions.table.noCategory")}
          />
          <DetailRow
            label={t("transactions.form.account")}
            value={account?.name ?? t("transactions.table.noAccount")}
          />
          {card ? (
            <DetailRow
              label={t("transactions.form.card")}
              value={`••••${card.last4} · ${card.name}`}
            />
          ) : null}
        </div>

        <CollapsibleSection title={t("transactions.form.moreDetails")} className="p-3">
          <div className="flex flex-col">
            {extraDetails.map((d) => (
              <DetailRow key={d.label} label={d.label} value={d.value || "-"} />
            ))}
          </div>
        </CollapsibleSection>
      </div>

      <div className="mt-6 flex justify-end gap-2">
        <Button variant="outline" onClick={() => onOpenChange(false)}>
          {t("common.cancel")}
        </Button>
        {onDelete ? (
          <Button
            variant="outline"
            className="text-destructive hover:bg-destructive/10"
            onClick={() => {
              onDelete(tx);
              onOpenChange(false);
            }}
          >
            <Trash2 className="h-4 w-4" aria-hidden />
            {t("common.delete")}
          </Button>
        ) : null}
        {onEdit ? (
          <Button
            onClick={() => {
              onEdit(tx);
              onOpenChange(false);
            }}
          >
            <Pencil className="h-4 w-4" aria-hidden />
            {t("common.edit")}
          </Button>
        ) : null}
      </div>
    </Dialog>
  );
}
