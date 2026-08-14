import { ChevronLeft, ChevronRight, Copy, Pencil, Trash2 } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

import type { accounts, transactions } from "@finance/contracts";

import { useLastNonNull } from "../../../shared/lib/useLastNonNull";
import { Button } from "../../../shared/ui/button";
import { SidePanel } from "../../../shared/ui/overlay";
import { balanceAfterTransaction } from "../lib/balanceAfter";
import { panelNavigation } from "../lib/panelNavigation";
import { AttachmentsSection } from "./AttachmentsSection";
import { TransactionDetailPanel } from "./TransactionDetailPanel";

interface Props {
  transaction: transactions.Transaction | null;
  accounts: accounts.BankAccount[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEdit?: (tx: transactions.Transaction) => void;
  /** Deletion always goes through the confirm dialog owned by the route (FR-006). */
  onDelete?: (tx: transactions.Transaction) => void;
  /** Opens the create form pre-filled from this movement, dated today. */
  onDuplicate?: (tx: transactions.Transaction) => void;

  /** Paging context (research D5): the very set the table behind is showing. */
  items?: transactions.Transaction[];
  /** Size of the whole filtered set, from the summary endpoint. */
  total?: number;
  hasNextPage?: boolean;
  onLoadMore?: () => void;
  /** Moves the panel to another movement of `items`. */
  onNavigate?: (tx: transactions.Transaction) => void;
  /** True while a `from`/`to` filter is active — hides the "balance after" figure. */
  dateFiltered?: boolean;
  children?: ReactNode;
}

/**
 * Shell around `TransactionDetailPanel`: a `SidePanel` whose header leads with
 * the paged ‹ › ("N de M") and trails with Duplicate + close, and whose footer
 * pins Delete / Duplicate / Edit. The visible title lives in the body (icon +
 * description + amount), so the chrome's own title is screen-reader only.
 */
export function TransactionDetailModal({
  transaction,
  accounts,
  open,
  onOpenChange,
  onEdit,
  onDelete,
  onDuplicate,
  items = [],
  total,
  hasNextPage = false,
  onLoadMore,
  onNavigate,
  dateFiltered = false,
  children,
}: Readonly<Props>) {
  const { t } = useTranslation();

  // Retained through the close so the surface can play its exit animation.
  const tx = useLastNonNull(transaction);
  if (!tx) return null;

  const index = items.findIndex((i) => i.id === tx.id);
  const nav =
    index >= 0 ? panelNavigation({ index, loaded: items.length, total, hasNextPage }) : null;
  const account = tx.bankAccountId ? accounts.find((a) => a.id === tx.bankAccountId) : undefined;

  const balanceAfter =
    index >= 0 ? balanceAfterTransaction({ items, index, account, dateFiltered }) : null;

  function go(target: number | null, needsMore: boolean) {
    if (target !== null) {
      const next = items[target];
      if (next) onNavigate?.(next);
      return;
    }
    // End of what's loaded: ask the parent for the next page. The panel stays
    // where it is and the user presses › again once the rows land.
    if (needsMore) onLoadMore?.();
  }

  const navControls = nav ? (
    <div className="flex items-center gap-1">
      <Button
        variant="ghost"
        size="sm"
        className="px-2"
        aria-label="previous"
        disabled={!nav.canGoPrevious}
        onClick={() => go(nav.previousIndex, false)}
      >
        <ChevronLeft className="h-4 w-4" aria-hidden />
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className="px-2"
        aria-label="next"
        disabled={!nav.canGoNext}
        onClick={() => go(nav.nextIndex, nav.needsMore)}
      >
        <ChevronRight className="h-4 w-4" aria-hidden />
      </Button>
      <span className="whitespace-nowrap text-sm tabular-nums text-muted-foreground">
        {t("transactions.detail.navPosition", { position: nav.position, count: nav.count })}
      </span>
    </div>
  ) : undefined;

  return (
    <SidePanel
      open={open}
      onOpenChange={onOpenChange}
      leading={navControls}
      title={<span className="sr-only">{t("transactions.detailTitle")}</span>}
      headerAside={
        onDuplicate ? (
          <Button
            variant="ghost"
            size="sm"
            className="px-2"
            aria-label={t("transactions.detail.duplicate")}
            title={t("transactions.detail.duplicate")}
            onClick={() => {
              onDuplicate(tx);
              onOpenChange(false);
            }}
          >
            <Copy className="h-4 w-4" aria-hidden />
          </Button>
        ) : undefined
      }
      footer={
        <div className="flex items-center gap-2">
          {onDelete ? (
            <Button
              variant="ghost"
              className="mr-auto text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={() => {
                onDelete(tx);
                onOpenChange(false);
              }}
            >
              <Trash2 className="h-4 w-4" aria-hidden />
              {t("common.delete")}
            </Button>
          ) : null}
          {onDuplicate ? (
            <Button
              variant="outline"
              onClick={() => {
                onDuplicate(tx);
                onOpenChange(false);
              }}
            >
              {t("transactions.detail.duplicate")}
            </Button>
          ) : null}
          {onEdit ? (
            <Button
              variant="accent"
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
      }
    >
      <TransactionDetailPanel
        transaction={tx}
        accounts={accounts}
        balanceAfter={balanceAfter}
        onAddDetails={
          onEdit
            ? () => {
                onEdit(tx);
                onOpenChange(false);
              }
            : undefined
        }
      >
        <AttachmentsSection transactionId={tx.id} />
        {children}
      </TransactionDetailPanel>
    </SidePanel>
  );
}
