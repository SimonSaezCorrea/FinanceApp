import { Pencil, Trash2 } from "lucide-react";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import type { accounts, transactions } from "@finance/contracts";
import { formatMoney } from "@finance/money";

import { CategoryIcon } from "./CategoryIcon";
import { RowActionsMenu } from "./RowActionsMenu";
import { SwipeRow } from "./SwipeRow";
import { Badge } from "../../../shared/ui/badge";
import { Button } from "../../../shared/ui/button";
import { Card } from "../../../shared/ui/card";
import { cn } from "../../../shared/lib/cn";
import { useElementWidth } from "../../../shared/lib/useElementWidth";
import { InfiniteScrollSentinel } from "../../../shared/ui/infinite-scroll-sentinel";
import { EmptyState } from "../../../shared/ui/states";
import { Table, TD, TH, THead, TR } from "../../../shared/ui/table";

interface TransactionTableProps {
  transactions: transactions.Transaction[];
  accounts: accounts.BankAccount[];
  onEdit?: (tx: transactions.Transaction) => void;
  onDelete?: (tx: transactions.Transaction) => void;
  onRowClick?: (tx: transactions.Transaction) => void;
  /** Hide the "Cuenta" column — redundant on a single account's own detail
   * page, where every row is already that account by construction. */
  showAccountColumn?: boolean;
  /** Infinite scroll. Omit all three for a complete, non-paginated list. */
  hasMore?: boolean;
  isLoadingMore?: boolean;
  onLoadMore?: () => void;
}

/**
 * Narrowest width at which the full column-per-field table still reads: below it
 * the rows fold into the compact list instead. Measured on the TABLE, not the
 * viewport — at 1024px the same screen leaves ~896px with the sidebar collapsed
 * (full table) and ~736px with it expanded (compact), and a media query can't
 * tell those apart.
 */
const FULL_TABLE_MIN_WIDTH = 860;

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
  onRowClick,
  showAccountColumn = true,
  hasMore = false,
  isLoadingMore = false,
  onLoadMore,
}: TransactionTableProps) {
  const { t, i18n } = useTranslation();
  const showActions = Boolean(onEdit || onDelete);
  // Only one row's swipe panel open at a time — opening another closes the
  // previous one for free, since both read off this single id.
  const [openSwipeId, setOpenSwipeId] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const width = useElementWidth(containerRef);
  // Before the first measurement (and in environments without ResizeObserver)
  // fall back to the compact list: it works at every width, so a wrong guess
  // here is a cosmetic downgrade rather than an overflowing table.
  const wide = width !== null && width >= FULL_TABLE_MIN_WIDTH;

  if (txs.length === 0) {
    return <EmptyState title={t("transactions.empty")} />;
  }

  const accountMap = new Map(accounts.map((a) => [a.id, a.name]));
  const cardMap = new Map(accounts.flatMap((a) => a.cards.map((c) => [c.id, c])));

  const sorted = [...txs].sort(
    (a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime(),
  );

  // The desktop "Tarjeta" column is only informative when the visible rows
  // actually use more than one card — filtered down to a single card (or an
  // account with just the one card), every row would repeat the same value.
  const showCardColumn = new Set(sorted.map((tx) => tx.cardId).filter(Boolean)).size > 1;

  return (
    <Card ref={containerRef} className="overflow-hidden p-0">
      {/* Full table, one column per field — only where the columns actually fit. */}
      <div className={wide ? "block" : "hidden"}>
        <Table>
          <THead className="bg-muted/50">
            <TR>
              <TH className="w-8" />
              <TH>{t("transactions.form.description")}</TH>
              <TH>{t("transactions.form.category")}</TH>
              <TH>{t("transactions.form.type")}</TH>
              {showAccountColumn ? <TH>{t("transactions.form.account")}</TH> : null}
              {showCardColumn ? <TH>{t("transactions.form.card")}</TH> : null}
              <TH className="whitespace-nowrap">{t("transactions.form.date")}</TH>
              <TH numeric>{t("transactions.form.amount")}</TH>
              {showActions ? <TH className="w-20" /> : null}
            </TR>
          </THead>
          <tbody>
            {sorted.map((tx) => {
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
                <TR
                  key={tx.id}
                  className={onRowClick ? "cursor-pointer hover:bg-muted/40" : "hover:bg-muted/40"}
                  onClick={() => onRowClick?.(tx)}
                >
                  <TD>
                    <span
                      className={`flex h-8 w-8 items-center justify-center rounded-full ${iconWrapColor}`}
                    >
                      <CategoryIcon category={tx.category} className="h-4 w-4" />
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
                  {showAccountColumn ? (
                    <TD className="text-muted-foreground">{accountName}</TD>
                  ) : null}
                  {showCardColumn ? (
                    <TD className="text-muted-foreground tabular-nums">
                      {card ? `••••${card.last4}` : <span className="opacity-40">—</span>}
                    </TD>
                  ) : null}
                  {/* `whitespace-nowrap`: at narrow table widths the browser was
                      wrapping the date word-by-word ("14 / ago / 2026") instead of
                      shrinking a different column — the date reads better fixed-width. */}
                  <TD className="whitespace-nowrap text-muted-foreground">
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
                            onClick={(e) => {
                              e.stopPropagation();
                              onEdit(tx);
                            }}
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
                            onClick={(e) => {
                              e.stopPropagation();
                              onDelete(tx);
                            }}
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
      </div>

      {/* Tablet + mobile: no more a real <table> — Categoría/Tipo/Tarjeta fold
          into a subdescription line under the description instead of their
          own columns. Tablet keeps a lightweight header + a "..." menu +
          the Fecha column; mobile drops the header AND the Fecha column,
          folding the date into the subdescription too, since a bare list of
          cards has no header row to hang a "Fecha" label off of. Both sizes
          get the same swipe-to-reveal Editar/Eliminar shortcut; a tap (not a
          swipe) opens the full detail sheet (`onRowClick`) — that sheet is
          the only way to reach edit/delete on mobile, where there's no menu. */}
      <div className={wide ? "hidden" : "block"}>
        <div className="hidden items-center gap-3 border-b bg-muted/50 px-4 py-2 text-xs font-medium text-muted-foreground sm:flex">
          <span className="w-8" />
          <span className="flex-1">{t("transactions.form.description")}</span>
          <span className="w-24 shrink-0">{t("transactions.form.date")}</span>
          <span className="w-24 shrink-0 text-right">{t("transactions.form.amount")}</span>
          {showActions ? <span className="w-8 shrink-0" /> : null}
        </div>

        <div className="divide-y">
          {sorted.map((tx) => {
            const card = tx.cardId ? cardMap.get(tx.cardId) : undefined;
            const isIncome = tx.type === "INCOME";
            const amountColor = isIncome ? "text-success" : "text-destructive";
            const iconWrapColor = isIncome
              ? "bg-success/15 text-success"
              : "bg-muted text-muted-foreground";
            const category = tx.category ?? t("transactions.table.noCategory");

            return (
              <SwipeRow
                key={tx.id}
                open={openSwipeId === tx.id}
                onOpenChange={(o) => setOpenSwipeId(o ? tx.id : null)}
                onEdit={onEdit ? () => onEdit(tx) : undefined}
                onDelete={onDelete ? () => onDelete(tx) : undefined}
                onTap={onRowClick ? () => onRowClick(tx) : undefined}
              >
                <div
                  className={cn(
                    "flex min-h-14 items-center gap-3 px-4 py-2",
                    onRowClick && "cursor-pointer",
                  )}
                >
                  <span
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${iconWrapColor}`}
                  >
                    <CategoryIcon category={tx.category} className="h-4 w-4" />
                  </span>

                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">
                      {tx.description ?? <span className="text-muted-foreground">—</span>}
                    </p>
                    {/* Mobile subdescription absorbs category, card AND date —
                        there are no columns left to carry them at this width.
                        Type is the one field left out: the amount's sign and
                        colour already say income vs. expense. */}
                    <p className="truncate text-xs text-muted-foreground sm:hidden">
                      {category}
                      {card ? ` · ••••${card.last4}` : ""} ·{" "}
                      {formatDate(tx.occurredAt, i18n.language)}
                    </p>
                    {/* Tablet subdescription: category · card · type — the date
                        gets its own column here instead. */}
                    <p className="hidden truncate text-xs text-muted-foreground sm:block">
                      {category}
                      {card ? ` · ••••${card.last4}` : ""} · {t(`transactions.type.${tx.type}`)}
                    </p>
                  </div>

                  <span className="hidden w-24 shrink-0 whitespace-nowrap text-sm text-muted-foreground sm:block">
                    {formatDate(tx.occurredAt, i18n.language)}
                  </span>

                  <span className={cn("w-24 shrink-0 text-right tabular-nums", amountColor)}>
                    {isIncome ? "+" : "−"}
                    {formatMoney(tx.amount, { currency: tx.currency, locale: i18n.language })}
                  </span>

                  {showActions ? (
                    // `data-swipe-action`: tells SwipeRow this subtree is its
                    // own control, so opening the menu doesn't also count as a
                    // tap on the row (which would open the detail sheet behind it).
                    <span data-swipe-action className="hidden w-8 shrink-0 sm:block">
                      <RowActionsMenu
                        onEdit={onEdit ? () => onEdit(tx) : undefined}
                        onDelete={onDelete ? () => onDelete(tx) : undefined}
                      />
                    </span>
                  ) : null}
                </div>
              </SwipeRow>
            );
          })}
        </div>
      </div>

      {/* Shared by both layouts — it sits after the desktop table and the
          tablet/mobile list, only one of which is ever rendered. */}
      {onLoadMore ? (
        <InfiniteScrollSentinel
          hasMore={hasMore}
          isLoading={isLoadingMore}
          onLoadMore={onLoadMore}
        />
      ) : null}
    </Card>
  );
}
