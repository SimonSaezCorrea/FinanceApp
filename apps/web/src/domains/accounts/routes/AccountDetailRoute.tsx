import { AlertTriangle, ChevronRight, Loader2, Pencil, Plus, Power, Trash2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useParams } from "react-router";
import { toast } from "sonner";

import { accounts as accountsContract } from "@finance/contracts";
import type { accounts, transactions } from "@finance/contracts";
import { formatMoney } from "@finance/money";

import { useAuth } from "../../auth/hooks/useAuth";
import { useInfiniteTransactions } from "../../transactions/hooks/useTransactions";
import { useTransactionMutations } from "../../transactions/hooks/useTransactionMutations";
import { TransactionCreateModal } from "../../transactions/components/TransactionCreateModal";
import { TransactionDetailModal } from "../../transactions/components/TransactionDetailModal";
import { TransactionDeleteConfirm } from "../../transactions/components/TransactionDeleteConfirm";
import { TransactionTable } from "../../transactions/components/TransactionTable";
import { ApiRequestError } from "../../../shared/lib/apiClient";
import { cn } from "../../../shared/lib/cn";
import { ASIDE_MIN_WIDTH, useElementWidth } from "../../../shared/lib/useElementWidth";
import { Badge } from "../../../shared/ui/badge";
import { Button } from "../../../shared/ui/button";
import { Card } from "../../../shared/ui/card";
import { ConfirmModal } from "../../../shared/ui/overlay";
import { Select } from "../../../shared/ui/select";
import { Switch } from "../../../shared/ui/switch";
import { EmptyState, ErrorState } from "../../../shared/ui/states";
import { AccountDetailSkeleton, MovementsTableSkeleton } from "../components/AccountDetailSkeleton";
import { AccountEditPanel } from "../components/AccountEditPanel";
import { Tabs } from "../../../shared/ui/tabs";
import { BillingSection } from "../components/BillingSection";
import { BillingSettingsModal } from "../components/BillingSettingsModal";
import { AccountVisualCard } from "../components/AccountVisualCard";
import { CardCreateModal } from "../components/CardCreateModal";
import { CardDetailPanel } from "../components/CardDetailPanel";
import { CardDetailSurface } from "../components/CardDetailSurface";
import { CardForm } from "../components/CardForm";
import { ACCOUNT_ICON } from "../components/accountVisuals";
import { useAccount, useAccountMutations } from "../hooks/useAccounts";
import { useCardMutations } from "../hooks/useCards";

export function AccountDetailRoute({ editing = false }: Readonly<{ editing?: boolean }>) {
  const { t, i18n } = useTranslation();
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [billingModalOpen, setBillingModalOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  // Shared by the movements table's own filter and (on desktop) the cards aside:
  // expanding a card there filters this table by it, which is the whole point of
  // showing both at once instead of in an overlay.
  const [cardFilter, setCardFilter] = useState("");
  const [tab, setTab] = useState<"movements" | "billing" | "cards">("movements");
  const { data: acc, isLoading, isError } = useAccount(id);
  const { setStatus, remove } = useAccountMutations();
  // Whether there's room for the cards aside is a question about THIS view's
  // width, not the window's: the collapsible sidebar changes it without the
  // viewport moving, so at 1280px the aside fits with the sidebar collapsed and
  // doesn't with it expanded (where the cards become the third tab instead).
  const [shellRef, shellWidth] = useElementWidth();
  const isDesktop = shellWidth !== null && shellWidth >= ASIDE_MIN_WIDTH;
  const activeTab = isDesktop && tab === "cards" ? "movements" : tab;

  // The placeholder keeps the SAME shell element (same type, same position) as the
  // loaded view, so React reuses the node: the width is already measured when the
  // data lands and the real layout renders correct on its first frame — instead of
  // painting the narrow one and snapping to two columns a tick later.
  if (isLoading || isError || !acc)
    return (
      <div ref={shellRef} className={cn("flex flex-col gap-4", isDesktop && "min-h-0 flex-1")}>
        {isLoading ? (
          // Takes the measured layout too: the skeleton already shows the side
          // column when there's room for it, so nothing moves once data lands.
          <AccountDetailSkeleton label={t("app.loading")} isDesktop={isDesktop} />
        ) : (
          <ErrorState title={t("errors.INTERNAL_ERROR")} />
        )}
      </div>
    );

  const Icon = ACCOUNT_ICON[acc.type];
  const pct = acc.balanceChangePct === null ? null : Number(acc.balanceChangePct);
  const hasCreditPool = acc.type === "CREDIT_LINE" || acc.cards.some((c) => c.kind === "CREDIT");
  const cardable = accountsContract.isCardableAccountType(acc.type);
  const tabItems = [
    { value: "movements" as const, label: t("transactions.title") },
    ...(hasCreditPool
      ? [{ value: "billing" as const, label: t("accounts.detail.billingTitle") }]
      : []),
    // Mobile only: on desktop these live in the side column.
    ...(!isDesktop && cardable ? [{ value: "cards" as const, label: t("cards.title") }] : []),
  ];
  const hasTabs = tabItems.length > 1;

  return (
    // On desktop the page itself never scrolls: the summary stays put and each
    // column (movements table / cards aside) owns its own scrollbar. `3rem` is the
    // layout container's py-6. Below `2xl` it falls back to normal page scrolling.
    <div
      ref={shellRef}
      className={cn(
        "flex flex-col gap-4",
        // On the two-column layout the page itself never scrolls: each column owns
        // its own scrollbar. `3rem` is the layout container's py-6.
        isDesktop && "h-[calc(100dvh-3rem)] overflow-hidden",
      )}
    >
      <nav className="flex shrink-0 items-center gap-1 text-sm text-muted-foreground">
        <Link to="/accounts" className="hover:text-foreground">
          {t("accounts.title")}
        </Link>
        <ChevronRight className="h-4 w-4" aria-hidden />
        <span className="text-foreground">{acc.name}</span>
      </nav>

      <div
        className={cn(
          "grid gap-6",
          isDesktop && "min-h-0 flex-1 grid-cols-[1fr_clamp(320px,24vw,480px)]",
        )}
      >
        {/* Main column */}
        <div className={cn("flex min-w-0 flex-col gap-6", isDesktop && "min-h-0")}>
          {/* Stacks below `lg` — the action row alone is wider than a phone/tablet.
              `lg`, not `2xl` (the two-column layout's own breakpoint): this row has
              plenty of room well before the side column appears, and waiting for
              `2xl` left it stacked with a wide empty gap beside the title from
              1024-1280px. */}
          <div className="flex shrink-0 flex-col gap-3 lg:flex-row lg:items-start lg:justify-between lg:gap-4">
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground">
                <Icon className="h-6 w-6" aria-hidden />
              </span>
              <div className="min-w-0">
                <h1 className="flex flex-wrap items-center gap-2 text-2xl font-semibold tracking-tight">
                  {/* Own item: as a bare text node the name becomes an anonymous
                      flex item that wraps word-by-word when the column is tight. */}
                  <span className="min-w-0 break-words">{acc.name}</span>
                  {/* Dimmed while the change is in flight: the badge is the thing
                      about to change, so it reads as "settling", and the swap to
                      the new value lands as the end of a transition. */}
                  <Badge
                    variant={acc.status === "ACTIVE" ? "success" : "neutral"}
                    className={cn(
                      "transition-opacity duration-200",
                      setStatus.isPending && "opacity-50",
                    )}
                  >
                    {t(`accounts.status.${acc.status}`)}
                  </Badge>
                  <BillingNotConfiguredBadge
                    account={acc}
                    onConfigure={() => setBillingModalOpen(true)}
                  />
                </h1>
                <p className="text-sm text-muted-foreground">
                  {t(`accounts.type.${acc.type}`)} · {acc.currency}
                  {acc.institution ? ` · ${acc.institution}` : ""}
                  {acc.accountNumber ? ` · ${acc.accountNumber}` : ""}
                </p>
              </div>
            </div>
            {/* Every account-level action lives here — including the destructive
                ones, which used to sit at the bottom of the (now scrollable) aside.
                Everyday actions first, then a divider, then the risky ones tinted
                by consequence: amber to pause the account, red to destroy it. */}
            <div className="flex flex-wrap items-center gap-1.5 lg:shrink-0 lg:justify-end">
              {/* Editing opens a side panel at `/accounts/:id/edit` — a URL, so
                  it's deep-linkable and Back closes it, while the account stays
                  behind it as the context being edited. */}
              <Button
                variant="secondary"
                size="sm"
                onClick={() => navigate(`/accounts/${id}/edit`)}
              >
                <Pencil className="h-4 w-4" aria-hidden />
                {t("accounts.actions.edit")}
              </Button>

              <span className="mx-1 h-5 w-px bg-border" aria-hidden />

              <Button
                variant="ghost"
                size="sm"
                className={cn(
                  acc.status === "ACTIVE"
                    ? "text-warning hover:bg-warning/10 hover:text-warning"
                    : "text-success hover:bg-success/10 hover:text-success",
                )}
                disabled={setStatus.isPending}
                onClick={() =>
                  setStatus.mutate({ id, status: acc.status === "ACTIVE" ? "INACTIVE" : "ACTIVE" })
                }
              >
                {/* The label still reads the CURRENT state while the switch is in
                    flight ("Desactivar" until it really is inactive), so only the
                    icon reports the work — swapping the label early would announce
                    a result the server hasn't confirmed. */}
                {setStatus.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                ) : (
                  <Power className="h-4 w-4" aria-hidden />
                )}
                {acc.status === "ACTIVE"
                  ? t("accounts.actions.deactivate")
                  : t("accounts.actions.activate")}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                disabled={remove.isPending}
                onClick={() => setConfirmDelete(true)}
              >
                <Trash2 className="h-4 w-4" aria-hidden />
                {t("accounts.actions.delete")}
              </Button>
            </div>
          </div>

          <KpiStrip account={acc} pct={pct} />
          {hasTabs ? (
            <Tabs className="shrink-0" value={activeTab} onChange={setTab} items={tabItems} />
          ) : null}
          {/* With the tab strip visible its label IS the section heading — an
                in-section <h2> repeating it is pure noise. Without tabs (a single
                view) the heading is the only thing naming the section, so it stays. */}
          {activeTab === "billing" ? <BillingSection account={acc} hideTitle={hasTabs} /> : null}
          {activeTab === "cards" ? (
            <CardsAside account={acc} holder={user?.name ?? undefined} hideTitle={hasTabs} />
          ) : null}
          {activeTab === "movements" ? (
            <MovementsSection
              account={acc}
              hideTitle={hasTabs}
              cardFilter={cardFilter}
              onCardFilterChange={setCardFilter}
              columnScroll={isDesktop}
            />
          ) : null}
        </div>

        {/* Side column — desktop only (on mobile its content is the "Tarjetas" tab
            above). The account tile stays put; only the cards list scrolls (see
            CardsAside), so it never drags the movements table along. */}
        <aside className={cn("flex-col gap-4", isDesktop ? "flex min-h-0" : "hidden")}>
          <CardsAside
            account={acc}
            holder={user?.name ?? undefined}
            onSelectCard={setCardFilter}
            // Without this the tiles had no scroller of their own, so a long list
            // pushed the column past the viewport with no way to reach the end —
            // the aside's whole point is that only the tiles scroll while its
            // header stays pinned.
            columnScroll
          />

          {acc.creditPools.length > 1 ? (
            <Card className="p-4">
              <span className="mb-3 block text-sm font-semibold">
                {t("accounts.detail.creditPools")}
              </span>
              <dl className="flex flex-col gap-2 text-sm">
                {acc.creditPools.map((p) => (
                  <div key={p.currency} className="flex items-center justify-between">
                    <dt className="text-muted-foreground">{p.currency}</dt>
                    <dd className="font-medium tabular-nums">
                      {formatMoney(p.used, { locale: i18n.language, currency: p.currency })}
                      {" / "}
                      {formatMoney(p.limit, { locale: i18n.language, currency: p.currency })}
                    </dd>
                  </div>
                ))}
              </dl>
            </Card>
          ) : null}
        </aside>
      </div>

      {/* Opened by the `/accounts/:id/edit` URL, closed by navigating back to the
          account — the panel never owns its own open/closed state. */}
      <AccountEditPanel
        account={acc}
        open={editing}
        onClose={() => navigate(`/accounts/${id}`)}
        onDeleted={() => navigate("/accounts")}
      />

      <BillingSettingsModal
        account={acc}
        open={billingModalOpen}
        onOpenChange={setBillingModalOpen}
      />

      <ConfirmModal
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={t("accounts.deleteConfirm")}
        description={t("accounts.deleteConfirmDescription")}
        confirmLabel={t("accounts.actions.delete")}
        loading={remove.isPending}
        onConfirm={() =>
          remove.mutate(id, {
            onSuccess: () => {
              toast.success(t("accounts.deleted"));
              setConfirmDelete(false);
              // Leave first: the account this route reads no longer exists.
              navigate("/accounts");
            },
            onError: (err) => {
              const code = err instanceof ApiRequestError ? err.code : "INTERNAL_ERROR";
              toast.error(t(`errors.${code}`, { defaultValue: t("errors.INTERNAL_ERROR") }));
            },
          })
        }
      />
    </div>
  );
}

/** Small reminder icon next to the account name (not just at creation time) while a
 * credit-pool account still has no billing day configured — click opens a dedicated
 * settings modal (not the full account-edit form). */
function BillingNotConfiguredBadge({
  account,
  onConfigure,
}: {
  account: accounts.BankAccount;
  onConfigure: () => void;
}) {
  const { t } = useTranslation();
  const hasCreditPool =
    account.type === "CREDIT_LINE" || account.cards.some((c) => c.kind === "CREDIT");
  if (!hasCreditPool || account.billingCycleDay !== null) return null;
  return (
    <button
      type="button"
      onClick={onConfigure}
      title={t("accounts.form.billingNotConfiguredWarning")}
      aria-label={t("accounts.form.billingNotConfiguredWarning")}
      className="flex h-6 w-6 items-center justify-center rounded-full bg-warning/15 text-warning hover:bg-warning/25"
    >
      <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
    </button>
  );
}

function KpiStrip({ account, pct }: { account: accounts.BankAccount; pct: number | null }) {
  const { t, i18n } = useTranslation();
  const fmt = (v: string) => formatMoney(v, { locale: i18n.language, currency: account.currency });
  // A CREDIT_LINE account has no real cash balance at all — its "balance" IS the
  // credit pool (shown in the Crédito card instead), so "Saldo actual" makes no
  // sense for it. Any other cardable account that's grown a credit card still has
  // its own real balance AND a credit pool, so both show side by side.
  const hasRealBalance = account.type !== "CREDIT_LINE";
  const hasCreditPool =
    account.type === "CREDIT_LINE" || account.cards.some((c) => c.kind === "CREDIT");
  const cols = (hasRealBalance ? 1 : 0) + 1 + (hasCreditPool ? 1 : 0);
  return (
    // Three across only from `lg`: at tablet widths the credit KPI's
    // "used / limit" pair doesn't fit in a third of the row.
    <div className={cn("grid gap-3 sm:grid-cols-2", cols === 3 && "lg:grid-cols-3")}>
      {hasRealBalance ? (
        <Kpi label={t("accounts.currentBalance")} value={fmt(account.currentBalance)} emphasis />
      ) : null}
      <Kpi
        label={t("accounts.detail.change")}
        value={
          pct === null
            ? "—"
            : `${pct > 0 ? "+" : ""}${pct.toLocaleString(i18n.language, { maximumFractionDigits: 1 })}%`
        }
        tone={pct === null ? undefined : pct < 0 ? "danger" : "success"}
      />
      {hasCreditPool ? <CreditKpi account={account} /> : null}
    </div>
  );
}

/** The account's own-currency credit pool as a progress bar — the combined total
 * across every card sharing it, never a single card's own usage (see AccountVisualCard). */
function CreditKpi({ account }: { account: accounts.BankAccount }) {
  const { t, i18n } = useTranslation();
  const fmt = (v: string) => formatMoney(v, { locale: i18n.language, currency: account.currency });
  const limit = Number(account.creditLimit);
  const used = Number(account.creditUsed);
  const pct = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  return (
    // Capped between `sm` and `lg`: with 3 KPIs on a 2-col grid this card is alone
    // on its row and would otherwise stretch to the full row width instead of
    // matching its siblings' size. From `lg` the 3-col grid fits it naturally.
    <Card className="flex flex-col gap-2 p-4 sm:max-w-sm lg:max-w-none">
      <span className="text-xs font-medium text-muted-foreground">
        {t("accounts.detail.credit")}
      </span>
      <p className="tabular-nums">
        <span className="text-xl font-semibold tracking-tight">{fmt(account.creditUsed)}</span>
        <span className="text-sm text-muted-foreground"> / {fmt(account.creditLimit)}</span>
      </p>
      <div className="flex items-center gap-2">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
        </div>
        <span className="text-xs font-medium tabular-nums text-muted-foreground">{pct}%</span>
      </div>
    </Card>
  );
}

function Kpi({
  label,
  value,
  emphasis,
  tone,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
  tone?: "success" | "danger";
}) {
  return (
    <Card className="flex flex-col gap-1 p-4">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <span
        className={cn(
          "tabular-nums tracking-tight",
          emphasis ? "text-2xl font-semibold" : "text-xl font-semibold",
          tone === "success" && "text-success",
          tone === "danger" && "text-destructive",
        )}
      >
        {value}
      </span>
    </Card>
  );
}

/** Movements list for this account, sharing the global table format + full CRUD. */
function MovementsSection({
  account,
  hideTitle,
  cardFilter,
  onCardFilterChange,
  columnScroll = false,
}: {
  account: accounts.BankAccount;
  /** The tab strip above already names this section — don't repeat it. */
  hideTitle?: boolean;
  /** Owned by the route: the desktop cards aside sets it too (expanding a card
   * filters this table by it), so it can't live inside this component. */
  cardFilter: string;
  onCardFilterChange: (cardId: string) => void;
  /** Two-column layout: this section owns its own scrollbar instead of letting
   * the page scroll. Decided by measured width upstream, not by a breakpoint. */
  columnScroll?: boolean;
}) {
  const { t } = useTranslation();
  const txQuery = useInfiniteTransactions({
    bankAccountId: account.id,
    cardId: cardFilter || undefined,
  });
  const { isLoading, isError } = txQuery;
  const { remove } = useTransactionMutations();
  const [modalOpen, setModalOpen] = useState(false);
  const [editTx, setEditTx] = useState<transactions.Transaction | null>(null);
  const [deleteTx, setDeleteTx] = useState<transactions.Transaction | null>(null);
  const [detailTx, setDetailTx] = useState<transactions.Transaction | null>(null);
  const list = txQuery.data?.pages.flatMap((p) => p.items) ?? [];

  const cardOptions = [
    { value: "", label: t("transactions.form.selectCard") },
    ...account.cards.map((c) => ({ value: c.id, label: `••••${c.last4} · ${c.name}` })),
  ];

  return (
    <div className={cn("flex flex-col gap-3", columnScroll && "min-h-0 flex-1")}>
      <div
        className={cn(
          "flex flex-wrap items-center justify-between gap-3",
          columnScroll && "shrink-0",
        )}
      >
        {hideTitle ? null : <h2 className="text-lg font-semibold">{t("transactions.title")}</h2>}
        {/* `justify-between` pins the button to the far edge regardless of the
            filter's width, instead of the two just trailing each other. The card
            filter shrinks (was pushing the button off-screen at 320px) but is
            capped so it doesn't stretch edge-to-edge on mid-width phones (456px). */}
        <div className="flex min-w-0 flex-1 items-center justify-between gap-2">
          {account.cards.length > 0 ? (
            <Select
              className="h-9 min-w-0 max-w-[220px] flex-1 sm:w-48 sm:max-w-none sm:flex-none"
              value={cardFilter}
              onChange={(e) => onCardFilterChange(e.target.value)}
              options={cardOptions}
              aria-label={t("transactions.form.selectCard")}
            />
          ) : null}
          <Button
            variant="accent"
            size="sm"
            className="shrink-0"
            onClick={() => {
              setEditTx(null);
              setModalOpen(true);
            }}
          >
            <Plus className="h-4 w-4" aria-hidden />
            {/* Icon-only on the narrowest phones: the label doesn't fit next to the
                filter below the `sm` breakpoint. */}
            <span className="sr-only sm:not-sr-only">{t("transactions.new")}</span>
          </Button>
        </div>
      </div>

      {/* Only the results scroll — the section heading, card filter and "new
          movement" button stay pinned above it. */}
      <div className={cn("scrollbar-thin", columnScroll && "min-h-0 flex-1 overflow-y-auto")}>
        {isLoading ? (
          <MovementsTableSkeleton />
        ) : isError ? (
          <ErrorState title={t("errors.INTERNAL_ERROR")} />
        ) : list.length === 0 ? (
          <EmptyState title={t("transactions.empty")} />
        ) : (
          <TransactionTable
            transactions={list}
            accounts={[account]}
            showAccountColumn={false}
            onEdit={(tx) => {
              setEditTx(tx);
              setModalOpen(true);
            }}
            onDelete={(tx) => setDeleteTx(tx)}
            onRowClick={(tx) => setDetailTx(tx)}
            hasMore={txQuery.hasNextPage}
            isLoadingMore={txQuery.isFetchingNextPage}
            onLoadMore={() => void txQuery.fetchNextPage()}
          />
        )}
      </div>

      <TransactionCreateModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        initial={editTx ?? undefined}
        defaultBankAccountId={account.id}
        lockAccount
      />

      <TransactionDetailModal
        transaction={detailTx}
        accounts={[account]}
        open={detailTx !== null}
        onOpenChange={(v) => !v && setDetailTx(null)}
        onEdit={(tx) => {
          setEditTx(tx);
          setModalOpen(true);
        }}
        onDelete={(tx) => setDeleteTx(tx)}
      />

      <TransactionDeleteConfirm
        transaction={deleteTx}
        accounts={[account]}
        loading={remove.isPending}
        onOpenChange={(v) => !v && setDeleteTx(null)}
        onConfirm={() => {
          if (!deleteTx) return;
          remove.mutate(deleteTx.id, {
            onSuccess: () => {
              toast.success(t("transactions.deleted"));
              setDeleteTx(null);
            },
            onError: () => toast.error(t("errors.INTERNAL_ERROR")),
          });
        }}
      />
    </div>
  );
}

/** Sidebar: every card of the account with a single uniform visual. Click a card to view/edit/delete it. */
function CardsAside({
  account,
  holder,
  hideTitle,
  onSelectCard,
  columnScroll = false,
  inlineExpand = false,
}: {
  account: accounts.BankAccount;
  holder?: string;
  /** Set when rendered as the mobile "Tarjetas" tab — the tab strip already names it. */
  hideTitle?: boolean;
  /** Desktop only: expanding a card also filters the movements table by it. */
  onSelectCard?: (cardId: string) => void;
  /** Side-column layout: only the tiles scroll, the header stays pinned. */
  columnScroll?: boolean;
  /** Clicking a card expands it in place instead of opening the drawer/window. */
  inlineExpand?: boolean;
}) {
  const { t } = useTranslation();
  const { remove, update } = useCardMutations(account.id);
  const [modalOpen, setModalOpen] = useState(false);
  const [editCard, setEditCard] = useState<accounts.Card | undefined>(undefined);
  const [deleteCard, setDeleteCard] = useState<accounts.Card | null>(null);
  const [viewCard, setViewCard] = useState<accounts.Card | null>(null);
  // Desktop expands the selected card in place instead of opening an overlay:
  // `expandedId` is the accordion's open row, `inlineEditing` swaps that same
  // block for the form. Below `2xl` both stay unused — there `viewCard` drives
  // the drawer/window surface.
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [inlineEditing, setInlineEditing] = useState(false);
  // Inactive cards are hidden by default: they keep their history but aren't
  // part of day-to-day use, so they'd only pad the column. Off by default, and
  // only offered when the account actually has one to show.
  const [showInactive, setShowInactive] = useState(false);
  // Inline expansion is now its OWN flag, not a synonym for "I'm the aside".
  // While the two were the same prop, giving the aside its scroller would also
  // have switched every card click from the drawer to the accordion — two
  // unrelated decisions that must be changeable one at a time.
  const isDesktop = inlineExpand;
  const cardable = accountsContract.isCardableAccountType(account.type);

  // As the mobile "Tarjetas" tab this renders in the full-width main column
  // (not the desktop aside's fixed 320px), so a single narrow stack (capped by
  // AccountVisualCard's own max-w-md) left most of the row empty — a grid uses
  // that width instead, growing to 3 columns past ~1024px so it keeps filling
  // the row as it gets wider rather than sitting at a fixed 2-up. `justify-items-
  // center`: each card is still capped at max-w-md, so a column wider than that
  // (there's more room per column than there are cards to fill it) centers the
  // card instead of stranding it against the column's left edge. The desktop
  // aside stays a single-column stack: its column is already only 320px, a grid
  // there would do nothing.
  // The mobile "Tarjetas" tab lays the tiles out as a grid in the full-width main
  // column, so each CELL caps the card (the tile itself no longer caps anything);
  // the desktop aside is a plain stack that fills its own column.
  const hasInactive = account.cards.some((c) => !c.isActive);
  const visibleCards = showInactive ? account.cards : account.cards.filter((c) => c.isActive);

  const tilesLayout = hideTitle
    ? "grid grid-cols-1 justify-items-center gap-3 sm:grid-cols-2 lg:grid-cols-3 [&>*]:max-w-md"
    : "flex flex-col gap-3 px-1";

  return (
    <div className={cn("flex flex-col gap-3", columnScroll && "min-h-0 flex-1")}>
      {/* Account types that can never carry a card (cash, savings, investment)
          drop the whole section — an "add a card" prompt they can't act on is
          noise, not an empty state. */}
      {cardable ? (
        <>
          <div className={cn("flex items-center justify-between", columnScroll && "shrink-0")}>
            {hideTitle ? null : <span className="text-sm font-semibold">{t("cards.title")}</span>}
            {hasInactive ? (
              <label className="ml-auto flex cursor-pointer items-center gap-2">
                <Switch
                  checked={showInactive}
                  onCheckedChange={setShowInactive}
                  aria-label={t("cards.showInactive")}
                />
                <span className="whitespace-nowrap text-xs text-muted-foreground">
                  {t("cards.showInactive")}
                </span>
              </label>
            ) : null}
            <Button
              className={cn(!hasInactive && "ml-auto")}
              variant="outline"
              size="sm"
              onClick={() => {
                setEditCard(undefined);
                setModalOpen(true);
              }}
            >
              <Plus className="h-3.5 w-3.5" aria-hidden />
              {t("cards.add")}
            </Button>
          </div>

          {/* Only the card tiles scroll — this section's header stays pinned. */}
          <div
            className={cn(
              tilesLayout,
              "scrollbar-thin",
              columnScroll && "min-h-0 flex-1 overflow-y-auto pr-1",
            )}
          >
            {visibleCards.length === 0 ? (
              <div className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
                <p>{t("cards.empty")}</p>
                <p>{t("cards.emptyHint")}</p>
              </div>
            ) : (
              visibleCards.map((card) => {
                const expanded = isDesktop && expandedId === card.id;
                return (
                  // One continuous surface when open: the tile squares off its
                  // bottom corners and the expansion continues inside the same
                  // ring, so the card GROWS instead of a second card appearing
                  // underneath it.
                  <div
                    key={card.id}
                    className={cn(
                      "flex w-full flex-col",
                      expanded && "overflow-hidden rounded-2xl ring-1 ring-brand/40",
                    )}
                  >
                    <AccountVisualCard
                      account={account}
                      card={card}
                      holder={holder}
                      expanded={expanded}
                      onClick={() => {
                        if (!isDesktop) {
                          setViewCard(card);
                          return;
                        }
                        // One open at a time: picking another card closes the
                        // previous expansion and drops out of its edit mode.
                        const next = expandedId === card.id ? null : card.id;
                        setInlineEditing(false);
                        setExpandedId(next);
                        onSelectCard?.(next ?? "");
                      }}
                    />
                    {expanded ? (
                      <div className="border-t border-brand/20 bg-card p-4">
                        {inlineEditing ? (
                          <>
                            <p className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-brand">
                              {t("cards.detail.editingThis")}
                            </p>
                            <CardForm
                              key={card.id}
                              submitLabel={t("common.saveChanges")}
                              submitting={update.isPending}
                              initial={card}
                              accountCurrency={account.currency}
                              accountCreditLimit={account.creditLimit}
                              hasExistingPrimary={account.cards.some(
                                (c) => c.kind === "CREDIT" && c.isPrimary && c.id !== card.id,
                              )}
                              onSubmit={(body) =>
                                update.mutate(
                                  { cardId: card.id, body },
                                  {
                                    onSuccess: () => {
                                      toast.success(t("cards.updated"));
                                      setInlineEditing(false);
                                    },
                                    onError: () => toast.error(t("errors.INTERNAL_ERROR")),
                                  },
                                )
                              }
                            />
                            <Button
                              variant="outline"
                              size="sm"
                              className="mt-3 w-full"
                              onClick={() => setInlineEditing(false)}
                            >
                              {t("common.cancel")}
                            </Button>
                          </>
                        ) : (
                          <>
                            {/* The tile above IS the visual — repeating it inside
                                the expansion would show the card twice. And the
                                movements table beside it is already filtered by
                                this card, so a recent-rows list would be a copy:
                                say that instead. */}
                            <CardDetailPanel
                              account={account}
                              card={card}
                              holder={holder}
                              variant="inline"
                              movementsAside={
                                <span className="text-xs text-brand">
                                  {t("cards.detail.filteringTable")}
                                </span>
                              }
                              movementsHint={t("cards.detail.filteringTableHint")}
                            />
                            <div className="mt-4 flex items-center justify-between gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
                                onClick={() => setDeleteCard(card)}
                              >
                                {t("common.delete")}
                              </Button>
                              <Button
                                variant="accent"
                                size="sm"
                                onClick={() => setInlineEditing(true)}
                              >
                                {t("cards.editTitle")}
                              </Button>
                            </div>
                          </>
                        )}
                      </div>
                    ) : null}
                  </div>
                );
              })
            )}
          </div>
        </>
      ) : null}

      {/* Desktop expands inline instead (above), so this only mounts below `2xl`:
          a drawer on a tablet, a full-screen window on a phone. */}
      {isDesktop ? null : (
        <CardDetailSurface
          account={account}
          card={viewCard}
          holder={holder}
          open={viewCard !== null}
          onOpenChange={(v) => !v && setViewCard(null)}
          // The panel STAYS open behind the confirmation: "Eliminar" only asks a
          // question, and closing the thing you're being asked about leaves you
          // confirming a deletion you can no longer see. It closes on success.
          onDelete={(card) => setDeleteCard(card)}
        />
      )}

      <CardCreateModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        account={account}
        holder={holder}
        hasExistingPrimary={account.cards.some(
          (c) => c.kind === "CREDIT" && c.isPrimary && c.id !== editCard?.id,
        )}
        initial={editCard}
      />

      <ConfirmModal
        open={deleteCard !== null}
        onOpenChange={(v) => !v && setDeleteCard(null)}
        title={t("cards.deleteConfirm")}
        description={t("cards.deleteConfirmDescription")}
        confirmLabel={t("common.delete")}
        loading={remove.isPending}
        onConfirm={() => {
          if (!deleteCard) return;
          remove.mutate(deleteCard.id, {
            onSuccess: () => {
              toast.success(t("cards.deleted"));
              setDeleteCard(null);
              // Now the card is gone, so its detail panel must go with it.
              setViewCard(null);
              setExpandedId(null);
            },
            onError: () => toast.error(t("errors.INTERNAL_ERROR")),
          });
        }}
      />
    </div>
  );
}
