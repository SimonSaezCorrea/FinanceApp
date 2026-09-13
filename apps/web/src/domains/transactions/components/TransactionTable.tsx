import { ArrowLeftRight, Inbox, Pencil, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import type { accounts, transactions } from "@finance/contracts";
import { formatMoney } from "@finance/money";

import { RowActionsMenu } from "./RowActionsMenu";
import { Badge } from "../../../shared/ui/badge";
import { Button } from "../../../shared/ui/button";
import { Card } from "../../../shared/ui/card";
import { CategoryIcon } from "../../../shared/ui/category-icon";
import { cn } from "../../../shared/lib/cn";
import { TABLE_ROW_MIN_WIDTH, useElementWidth } from "../../../shared/lib/useElementWidth";
import { InfiniteScrollSentinel } from "../../../shared/ui/infinite-scroll-sentinel";
import { ErrorState } from "../../../shared/ui/states";
import { SwipeRow } from "../../../shared/ui/swipe-row";
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
  /** Hide the "Categoría" column — an account's own Movimientos tab drops it. */
  showCategoryColumn?: boolean;
  /** Hide the "Tipo" column — an account's own Movimientos tab drops it too;
   * the amount's sign/colour already say income vs. expense there. */
  showTypeColumn?: boolean;
  /** The load's own error, if any — shown INSIDE the table chrome (see
   * `isEmpty`'s comment below) instead of swapping the whole table out.
   * `transactions` is `[]` whenever this is set. */
  error?: unknown;
  onRetry?: () => void;
  /**
   * Movement to point out for a moment — the one just created or edited. A new
   * movement is NOT necessarily the top row (the list is ordered by date, so one
   * dated earlier lands further down), and without this the save reads as "the
   * table didn't update".
   */
  highlightId?: string | null;
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
 *
 * `TABLE_ROW_MIN_WIDTH` — shared with Cuotas and Facturación, which used to
 * each pick their own value. Re-exported under this table's original name so
 * its own loading placeholder (which splits at the same width — a skeleton
 * showing columns the real table then drops is a layout jump) doesn't need a
 * second import.
 */
export const FULL_TABLE_MIN_WIDTH = TABLE_ROW_MIN_WIDTH;

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
  showCategoryColumn = true,
  showTypeColumn = true,
  highlightId = null,
  hasMore = false,
  isLoadingMore = false,
  onLoadMore,
  error,
  onRetry,
}: TransactionTableProps) {
  const { t, i18n } = useTranslation();
  const showActions = Boolean(onEdit || onDelete);
  // Only one row's swipe panel open at a time — opening another closes the
  // previous one for free, since both read off this single id.
  const [openSwipeId, setOpenSwipeId] = useState<string | null>(null);
  // The highlight fades on its own: it is a "look here", not a selection. Only
  // the FADE is state — deriving the lit row from the prop keeps the effect from
  // setting state synchronously (which would cascade a render on every save).
  const [faded, setFaded] = useState<string | null>(null);
  useEffect(() => {
    if (!highlightId) return;
    const timer = setTimeout(() => setFaded(highlightId), 4000);
    return () => clearTimeout(timer);
  }, [highlightId]);
  const highlighted = highlightId && highlightId !== faded ? highlightId : null;
  const [containerRef, width] = useElementWidth();
  // `FULL_TABLE_MIN_WIDTH` is only a cheap first guess from the container's own
  // width — this table's real column set varies (`showAccountColumn`,
  // `showCardColumn`, `showActions` each add/remove a column), so a single fixed
  // threshold can't account for every combination: it used to let the full
  // layout switch on for a combination whose actual content needed more room
  // than that, and the table's own `overflow-x-auto` wrapper
  // (`shared/ui/table.tsx`) opened a lateral scrollbar instead of the container
  // falling back to the compact list. `overflowing` is the real answer, read
  // off the rendered DOM once the guess puts the full table on screen — see the
  // effect below.
  const [scrollWrapEl, setScrollWrapEl] = useState<HTMLDivElement | null>(null);
  const [overflowing, setOverflowing] = useState(false);
  const tentativeWide = width !== null && width >= FULL_TABLE_MIN_WIDTH;
  // Give the guess another chance every time the container's width itself
  // changes — otherwise, once `overflowing` latched `true` at some narrower
  // width, the full table stays hidden (0×0, no resize to react to) even after
  // the container grows enough to actually fit it.
  useEffect(() => {
    setOverflowing(false);
  }, [width]);
  useEffect(() => {
    if (!scrollWrapEl || typeof ResizeObserver === "undefined") return;
    const check = () => {
      // Hidden right now (display:none collapses both to 0) — nothing to learn
      // until it's shown again, which is itself a resize this observer sees.
      if (scrollWrapEl.clientWidth === 0) return;
      setOverflowing(scrollWrapEl.scrollWidth > scrollWrapEl.clientWidth + 1);
    };
    check();
    const observer = new ResizeObserver(check);
    observer.observe(scrollWrapEl);
    return () => observer.disconnect();
  }, [scrollWrapEl]);
  const wide = tentativeWide && !overflowing;

  // Empty is rendered INSIDE the table chrome (headers + one spanning row), not
  // as a bare card in its place: the columns are what say what this table would
  // hold, so swapping them for a dashed box loses that and jumps the layout as
  // soon as the first movement lands.
  const isEmpty = txs.length === 0;

  const accountMap = new Map(accounts.map((a) => [a.id, a.name]));
  const cardMap = new Map(accounts.flatMap((a) => a.cards.map((c) => [c.id, c])));

  const sorted = [...txs].sort(
    (a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime(),
  );

  // Always rendered (same column set regardless of how many distinct cards
  // the visible rows happen to use) — a column set that shifts under the
  // user depending on filtered data reads as a layout bug, not a feature.
  const showCardColumn = true;

  return (
    <Card ref={containerRef} className="overflow-hidden p-0">
      {/* Full table, one column per field — only where the columns actually fit.
          `scrollWrapEl`'s own scrollWidth-vs-clientWidth is what decides `wide`
          for real (see the effect above) — it has to be `Table`'s OWN
          `overflow-x-auto` wrapper (forwarded via `ref`), not this outer div:
          this div's child is capped at `w-full`, so IT never overflows even
          when the table genuinely does — see `shared/ui/table.tsx`'s comment. */}
      <div className={wide ? "block" : "hidden"}>
        {/* `table-fixed`: with the browser's default `table-layout: auto`, the
            `w-*` classes below are only a hint — the real column width still
            gets recomputed from the widest cell CURRENTLY RENDERED in that
            column, so the same "Fecha"/"Monto" column visibly changed size
            page to page depending on which amounts/dates happened to be
            loaded. Fixed layout takes column widths from this header row
            once and never revisits them — only "Descripción" is left
            unspecified, so it alone absorbs the remaining width. */}
        <Table ref={setScrollWrapEl} className="table-fixed">
          <THead className="bg-muted/50">
            <TR>
              <TH className="w-8" />
              <TH>{t("transactions.form.description")}</TH>
              {showCategoryColumn ? (
                <TH className="w-32">{t("transactions.form.category")}</TH>
              ) : null}
              {showTypeColumn ? <TH className="w-24">{t("transactions.form.type")}</TH> : null}
              {showAccountColumn ? (
                <TH className="min-w-40">{t("transactions.form.account")}</TH>
              ) : null}
              {showCardColumn ? (
                <TH className="w-28 whitespace-nowrap">{t("transactions.form.card")}</TH>
              ) : null}
              <TH className="w-28 whitespace-nowrap">{t("transactions.form.date")}</TH>
              <TH numeric className="w-32">
                {t("transactions.form.amount")}
              </TH>
              {showActions ? <TH className="w-28 px-3" /> : null}
            </TR>
          </THead>
          <tbody>
            {sorted.map((tx) => {
              const accountName = tx.bankAccountId
                ? (accountMap.get(tx.bankAccountId) ?? t("transactions.table.noAccount"))
                : t("transactions.table.noAccount");
              const card = tx.cardId ? cardMap.get(tx.cardId) : undefined;
              const isIncome = tx.type === "INCOME";
              // A transfer leg is an ordinary row for the balance, but it is
              // neither income nor expense — say so instead of colouring it red.
              const isTransfer = tx.transferGroupId !== null;
              const amountColor = isIncome ? "text-success" : "text-destructive";
              const iconWrapColor = isTransfer
                ? "bg-info/15 text-info"
                : isIncome
                  ? "bg-success/15 text-success"
                  : "bg-muted text-muted-foreground";

              return (
                <TR
                  key={tx.id}
                  className={cn(
                    "hover:bg-muted/40",
                    onRowClick && "cursor-pointer",
                    // `border-b-accent/40` too: the row's own separator paints
                    // ON TOP of the inset ring's bottom edge, so without it the
                    // highlight looks open at the bottom (three sides, not four).
                    tx.id === highlighted &&
                      "border-b-accent/40 bg-accent/10 ring-1 ring-inset ring-accent/40",
                  )}
                  onClick={() => onRowClick?.(tx)}
                >
                  <TD>
                    <span
                      className={`flex h-8 w-8 items-center justify-center rounded-full ${iconWrapColor}`}
                    >
                      {isTransfer ? (
                        <ArrowLeftRight className="h-4 w-4" aria-hidden />
                      ) : (
                        <CategoryIcon category={tx.category} className="h-4 w-4" />
                      )}
                    </span>
                  </TD>
                  {/* `w-full max-w-0` + a truncating child: the only column with no
                      fixed-content minimum of its own (every other one is a badge,
                      a monospace last4, a nowrap date/amount, or an icon) — without
                      this, auto table layout gives it its full unwrapped preferred
                      width first and only wraps once rendering literally runs out
                      of room, which can still leave the TABLE wider than its
                      container even though the text itself wrapped. */}
                  <TD className="w-full max-w-0 font-medium">
                    <div className="truncate">
                      {tx.description ?? <span className="text-muted-foreground">—</span>}
                    </div>
                  </TD>
                  {showCategoryColumn ? (
                    <TD>
                      <span className="text-sm">
                        {tx.category ?? (
                          <span className="text-muted-foreground">
                            {t("transactions.table.noCategory")}
                          </span>
                        )}
                      </span>
                    </TD>
                  ) : null}
                  {showTypeColumn ? (
                    <TD>
                      <Badge variant={isTransfer ? "info" : isIncome ? "success" : "danger"}>
                        {isTransfer
                          ? t("transactions.type.TRANSFER")
                          : t(`transactions.type.${tx.type}`)}
                      </Badge>
                    </TD>
                  ) : null}
                  {showAccountColumn ? (
                    <TD className="min-w-40 text-muted-foreground">{accountName}</TD>
                  ) : null}
                  {showCardColumn ? (
                    <TD className="w-28 whitespace-nowrap text-muted-foreground tabular-nums">
                      {card ? `••••${card.last4}` : <span className="opacity-40">—</span>}
                    </TD>
                  ) : null}
                  {/* `whitespace-nowrap`: at narrow table widths the browser was
                      wrapping the date word-by-word ("14 / ago / 2026") instead of
                      shrinking a different column — the date reads better fixed-width. */}
                  <TD className="w-28 whitespace-nowrap text-muted-foreground">
                    {formatDate(tx.occurredAt, i18n.language)}
                  </TD>
                  <TD numeric className={cn("w-32 whitespace-nowrap", amountColor)}>
                    {isIncome ? "+" : "−"}
                    {formatMoney(tx.amount, { currency: tx.currency, locale: i18n.language })}
                  </TD>
                  {showActions ? (
                    // Fixed width (`w-28`, matching the other fixed columns) with
                    // tighter horizontal padding (`px-3` vs. the default `px-6`)
                    // — two ghost icon buttons plus the default padding didn't
                    // fit `w-20`, so the pair rendered pushed up against the
                    // amount column instead of sitting inside their own cell.
                    <TD className="px-3">
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
            const accountName = tx.bankAccountId
              ? (accountMap.get(tx.bankAccountId) ?? t("transactions.table.noAccount"))
              : t("transactions.table.noAccount");
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
                    tx.id === highlighted && "bg-accent/10 ring-1 ring-inset ring-accent/40",
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
                    {/* Tablet subdescription: cuenta · categoría · tarjeta · tipo — the
                        date gets its own column here instead. `showAccountColumn`
                        false (an account's own Movimientos tab) drops the account
                        the same way the desktop columns already do; when it's
                        true (the general Movimientos view) this is otherwise the
                        one place that account name goes missing once the table
                        folds into this compact layout, even though the wide
                        format shows it as its own column. */}
                    <p className="hidden truncate text-xs text-muted-foreground sm:block">
                      {showAccountColumn ? `${accountName} · ` : ""}
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

      {/* Rendered ONCE, below whichever layout is showing (both are mounted, one
          hidden by class) — duplicating it would put the same message in the DOM
          twice. The headers above still stand, so the table keeps its shape,
          whether the row is empty or the load itself failed. */}
      {error ? (
        <ErrorState inline error={error} onRetry={onRetry} />
      ) : isEmpty ? (
        <div className="px-4 py-10">
          <EmptyRow />
        </div>
      ) : null}

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

/** The message that occupies the table's body while it has no rows. No border of
 *  its own: the surrounding Card and the header row are already the frame. */
function EmptyRow() {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col items-center justify-center gap-2 text-center">
      <Inbox className="h-6 w-6 text-muted-foreground" aria-hidden />
      <p className="font-medium">{t("transactions.empty")}</p>
      <p className="text-sm text-muted-foreground">{t("transactions.emptyHint")}</p>
    </div>
  );
}
