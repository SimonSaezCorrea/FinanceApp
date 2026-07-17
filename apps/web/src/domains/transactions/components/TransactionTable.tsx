import { Pencil, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";

import type { accounts, transactions } from "@finance/contracts";
import { formatMoney } from "@finance/money";

import { Badge } from "../../../shared/ui/badge";
import { Button } from "../../../shared/ui/button";
import { Card } from "../../../shared/ui/card";
import { EmptyState } from "../../../shared/ui/states";
import { Table, TD, TH, THead, TR } from "../../../shared/ui/table";
import { categoryIcon } from "../lib/categoryIcons";

interface TransactionTableProps {
  transactions: transactions.Transaction[];
  accounts: accounts.BankAccount[];
  onEdit?: (tx: transactions.Transaction) => void;
  onDelete?: (tx: transactions.Transaction) => void;
}

function formatDate(iso: string, locale: string): string {
  return new Date(iso).toLocaleDateString(locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function TransactionTable({
  transactions: txs,
  accounts,
  onEdit,
  onDelete,
}: TransactionTableProps) {
  const { t, i18n } = useTranslation();
  const showActions = Boolean(onEdit || onDelete);

  if (txs.length === 0) {
    return <EmptyState title={t("transactions.empty")} />;
  }

  const accountMap = new Map(accounts.map((a) => [a.id, a.name]));
  const cardMap = new Map(accounts.flatMap((a) => a.cards.map((c) => [c.id, c])));

  const sorted = [...txs].sort(
    (a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime(),
  );

  return (
    <Card className="overflow-hidden p-0">
      <Table>
        <THead className="bg-muted/50">
          <TR>
            <TH className="w-8" />
            <TH>{t("transactions.form.description")}</TH>
            <TH>{t("transactions.form.category")}</TH>
            <TH>{t("transactions.form.type")}</TH>
            <TH>{t("transactions.form.account")}</TH>
            <TH>{t("transactions.form.card")}</TH>
            <TH>{t("transactions.form.date")}</TH>
            <TH numeric>{t("transactions.form.amount")}</TH>
            {showActions ? <TH className="w-20" /> : null}
          </TR>
        </THead>
        <tbody>
          {sorted.map((tx) => {
            const Icon = categoryIcon(tx.category);
            const accountName = tx.bankAccountId
              ? (accountMap.get(tx.bankAccountId) ?? t("transactions.table.noAccount"))
              : t("transactions.table.noAccount");
            const card = tx.cardId ? cardMap.get(tx.cardId) : undefined;
            const isIncome = tx.type === "INCOME";
            const amountColor = isIncome ? "text-success" : "text-destructive";
            const iconWrapColor = isIncome
              ? "bg-success/15 text-success"
              : "bg-muted text-muted-foreground";

            return (
              <TR key={tx.id} className="hover:bg-muted/40">
                <TD>
                  <span
                    className={`flex h-8 w-8 items-center justify-center rounded-full ${iconWrapColor}`}
                  >
                    <Icon className="h-4 w-4" aria-hidden />
                  </span>
                </TD>
                <TD className="font-medium">
                  {tx.description ?? <span className="text-muted-foreground">—</span>}
                </TD>
                <TD>
                  <span className="text-sm">
                    {tx.category ?? (
                      <span className="text-muted-foreground">
                        {t("transactions.table.noCategory")}
                      </span>
                    )}
                  </span>
                </TD>
                <TD>
                  <Badge variant={isIncome ? "success" : "danger"}>
                    {t(`transactions.type.${tx.type}`)}
                  </Badge>
                </TD>
                <TD className="text-muted-foreground">{accountName}</TD>
                <TD className="text-muted-foreground tabular-nums">
                  {card ? `••••${card.last4}` : <span className="opacity-40">—</span>}
                </TD>
                <TD className="text-muted-foreground">
                  {formatDate(tx.occurredAt, i18n.language)}
                </TD>
                <TD numeric className={amountColor}>
                  {isIncome ? "+" : "−"}
                  {formatMoney(tx.amount, { currency: tx.currency, locale: i18n.language })}
                </TD>
                {showActions ? (
                  <TD>
                    <span className="flex justify-end gap-1">
                      {onEdit ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          aria-label={t("accounts.actions.edit")}
                          onClick={() => onEdit(tx)}
                        >
                          <Pencil className="h-4 w-4" aria-hidden />
                        </Button>
                      ) : null}
                      {onDelete ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          aria-label={t("accounts.actions.delete")}
                          className="text-destructive hover:bg-destructive/10"
                          onClick={() => onDelete(tx)}
                        >
                          <Trash2 className="h-4 w-4" aria-hidden />
                        </Button>
                      ) : null}
                    </span>
                  </TD>
                ) : null}
              </TR>
            );
          })}
        </tbody>
      </Table>
    </Card>
  );
}
