import { AlertTriangle, ChevronRight, Pencil, Plus, Power, RefreshCw, Trash2 } from "lucide-react";
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
import { TransactionTable } from "../../transactions/components/TransactionTable";
import { cn } from "../../../shared/lib/cn";
import { DESKTOP_QUERY, useMediaQuery } from "../../../shared/lib/useMediaQuery";
import { Badge } from "../../../shared/ui/badge";
import { Button } from "../../../shared/ui/button";
import { Card, CardContent } from "../../../shared/ui/card";
import { ConfirmDialog } from "../../../shared/ui/confirm-dialog";
import { Select } from "../../../shared/ui/select";
import { EmptyState, ErrorState, LoadingState } from "../../../shared/ui/states";
import { Tabs } from "../../../shared/ui/tabs";
import { AccountForm } from "../components/AccountForm";
import { BillingSection } from "../components/BillingSection";
import { BillingSettingsModal } from "../components/BillingSettingsModal";
import { AccountVisualCard } from "../components/AccountVisualCard";
import { CardCreateModal } from "../components/CardCreateModal";
import { CardDetailModal } from "../components/CardDetailModal";
import { ACCOUNT_ICON } from "../components/accountVisuals";
import { useAccount, useAccountMutations } from "../hooks/useAccounts";
import { useCardMutations } from "../hooks/useCards";

export function AccountDetailRoute() {
  const { t, i18n } = useTranslation();
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [editing, setEditing] = useState(false);
  const [billingModalOpen, setBillingModalOpen] = useState(false);
  const [tab, setTab] = useState<"movements" | "billing" | "cards">("movements");
  const { data: acc, isLoading, isError } = useAccount(id);
  const { update, setStatus, reconcile, remove } = useAccountMutations();
  // Below `xl` there is no side column, so the cards become a third tab instead.
  // Derived (not an effect): resizing up to desktop drops the mobile-only tab.
  const isDesktop = useMediaQuery(DESKTOP_QUERY);
  const activeTab = isDesktop && tab === "cards" ? "movements" : tab;

  if (isLoading) return <LoadingState title={t("app.loading")} />;
  if (isError || !acc) return <ErrorState title={t("errors.INTERNAL_ERROR")} />;

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
    // layout container's py-6. Below `xl` it falls back to normal page scrolling.
    <div className="flex flex-col gap-4 xl:h-[calc(100dvh-3rem)] xl:overflow-hidden">
      <nav className="flex shrink-0 items-center gap-1 text-sm text-muted-foreground">
        <Link to="/accounts" className="hover:text-foreground">
          {t("accounts.title")}
        </Link>
        <ChevronRight className="h-4 w-4" aria-hidden />
        <span className="text-foreground">{acc.name}</span>
      </nav>

      <div className="grid gap-6 xl:min-h-0 xl:flex-1 xl:grid-cols-[1fr_320px]">
        {/* Main column */}
        <div className="flex min-w-0 flex-col gap-6 xl:min-h-0">
          {/* Stacks below `lg` — the action row alone is wider than a phone/tablet.
              `lg`, not `xl` (the two-column layout's own breakpoint): this row has
              plenty of room well before the side column appears, and waiting for
              `xl` left it stacked with a wide empty gap beside the title from
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
                  <Badge variant={acc.status === "ACTIVE" ? "success" : "neutral"}>
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
              <Button variant="secondary" size="sm" onClick={() => setEditing((v) => !v)}>
                <Pencil className="h-4 w-4" aria-hidden />
                {editing ? t("common.cancel") : t("accounts.actions.edit")}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                disabled={reconcile.isPending}
                onClick={() => reconcile.mutate(id)}
              >
                <RefreshCw className="h-4 w-4" aria-hidden />
                {t("accounts.actions.reconcile")}
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
                <Power className="h-4 w-4" aria-hidden />
                {acc.status === "ACTIVE"
                  ? t("accounts.actions.deactivate")
                  : t("accounts.actions.activate")}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                onClick={() => remove.mutate(id, { onSuccess: () => navigate("/accounts") })}
              >
                <Trash2 className="h-4 w-4" aria-hidden />
                {t("accounts.actions.delete")}
              </Button>
            </div>
          </div>

          {editing ? (
            <Card className="xl:min-h-0 xl:flex-1 xl:overflow-y-auto scrollbar-thin">
              <CardContent className="pt-6">
                <AccountForm
                  submitLabel={t("accounts.actions.save")}
                  submitting={update.isPending}
                  hasCreditCard={acc.cards.some((c) => c.kind === "CREDIT")}
                  initial={{
                    name: acc.name,
                    type: acc.type,
                    status: acc.status,
                    institutionId: acc.institutionId ?? "",
                    accountNumber: acc.accountNumber ?? "",
                    currency: acc.currency,
                    initialBalance: acc.initialBalance,
                    creditLimit: acc.creditLimit,
                    creditUsedInitial: acc.creditUsed,
                    billingCycleDay: acc.billingCycleDay?.toString() ?? "",
                    paymentMethod: acc.paymentMethod,
                  }}
                  onSubmit={(v) =>
                    update.mutate(
                      {
                        id,
                        body: {
                          name: v.name,
                          type: v.type,
                          status: v.status,
                          currency: v.currency,
                          institutionId: v.institutionId || undefined,
                          accountNumber: v.accountNumber || undefined,
                          initialBalance: v.initialBalance || "0",
                          creditLimit: v.creditLimit || "0",
                          creditUsedInitial: v.creditUsedInitial || "0",
                          billingCycleDay: v.billingCycleDay ? Number(v.billingCycleDay) : null,
                          paymentMethod: v.paymentMethod,
                        },
                      },
                      { onSuccess: () => setEditing(false) },
                    )
                  }
                />
              </CardContent>
            </Card>
          ) : (
            <>
              <KpiStrip account={acc} pct={pct} />
              {hasTabs ? (
                <Tabs className="shrink-0" value={activeTab} onChange={setTab} items={tabItems} />
              ) : null}
              {/* With the tab strip visible its label IS the section heading — an
                  in-section <h2> repeating it is pure noise. Without tabs (a single
                  view) the heading is the only thing naming the section, so it stays. */}
              {activeTab === "billing" ? (
                <BillingSection account={acc} hideTitle={hasTabs} />
              ) : null}
              {activeTab === "cards" ? (
                <CardsAside account={acc} holder={user?.name ?? undefined} hideTitle={hasTabs} />
              ) : null}
              {activeTab === "movements" ? (
                <MovementsSection account={acc} hideTitle={hasTabs} />
              ) : null}
            </>
          )}
        </div>

        {/* Side column — desktop only (on mobile its content is the "Tarjetas" tab
            above). The account tile stays put; only the cards list scrolls (see
            CardsAside), so it never drags the movements table along. */}
        <aside className="hidden flex-col gap-4 xl:flex xl:min-h-0">
          <CardsAside account={acc} holder={user?.name ?? undefined} />

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

      <BillingSettingsModal
        account={acc}
        open={billingModalOpen}
        onOpenChange={setBillingModalOpen}
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
}: {
  account: accounts.BankAccount;
  /** The tab strip above already names this section — don't repeat it. */
  hideTitle?: boolean;
}) {
  const { t } = useTranslation();
  const [cardFilter, setCardFilter] = useState("");
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
    <div className="flex flex-col gap-3 xl:min-h-0 xl:flex-1">
      <div className="flex flex-wrap items-center justify-between gap-3 xl:shrink-0">
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
              onChange={(e) => setCardFilter(e.target.value)}
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
            {/* Icon-only below 550px: the label doesn't fit next to the filter there. */}
            <span className="sr-only min-[500px]:not-sr-only">{t("transactions.new")}</span>
          </Button>
        </div>
      </div>

      {/* Only the results scroll — the section heading, card filter and "new
          movement" button stay pinned above it. */}
      <div className="xl:min-h-0 xl:flex-1 xl:overflow-y-auto scrollbar-thin">
        {isLoading ? (
          <LoadingState title={t("app.loading")} />
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

      <ConfirmDialog
        open={deleteTx !== null}
        onOpenChange={(v) => !v && setDeleteTx(null)}
        title={t("transactions.deleteConfirm")}
        loading={remove.isPending}
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
}: {
  account: accounts.BankAccount;
  holder?: string;
  /** Set when rendered as the mobile "Tarjetas" tab — the tab strip already names it. */
  hideTitle?: boolean;
}) {
  const { t } = useTranslation();
  const { remove } = useCardMutations(account.id);
  const [modalOpen, setModalOpen] = useState(false);
  const [editCard, setEditCard] = useState<accounts.Card | undefined>(undefined);
  const [deleteCard, setDeleteCard] = useState<accounts.Card | null>(null);
  const [viewCard, setViewCard] = useState<accounts.Card | null>(null);
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
  const tilesLayout = hideTitle
    ? "grid grid-cols-1 justify-items-center gap-3 sm:grid-cols-2 lg:grid-cols-3"
    : "flex flex-col gap-3";

  return (
    <div className="flex flex-col gap-3 xl:min-h-0 xl:flex-1">
      {/* Account types that can never carry a card (cash, savings, investment)
          drop the whole section — an "add a card" prompt they can't act on is
          noise, not an empty state. */}
      {cardable ? (
        <>
          <div className="flex items-center justify-between xl:shrink-0">
            {hideTitle ? null : <span className="text-sm font-semibold">{t("cards.title")}</span>}
            <Button
              className="ml-auto"
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
              "xl:min-h-0 xl:flex-1 xl:overflow-y-auto xl:pr-1 scrollbar-thin",
            )}
          >
            {account.cards.length === 0 ? (
              <div className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
                <p>{t("cards.empty")}</p>
                <p>{t("cards.emptyHint")}</p>
              </div>
            ) : (
              account.cards.map((card) => (
                <AccountVisualCard
                  key={card.id}
                  account={account}
                  card={card}
                  holder={holder}
                  onClick={() => setViewCard(card)}
                />
              ))
            )}
          </div>
        </>
      ) : null}

      <CardDetailModal
        account={account}
        card={viewCard}
        holder={holder}
        open={viewCard !== null}
        onOpenChange={(v) => !v && setViewCard(null)}
        onEdit={(card) => {
          setEditCard(card);
          setModalOpen(true);
        }}
        onDelete={(card) => setDeleteCard(card)}
      />

      <CardCreateModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        accountId={account.id}
        accountCurrency={account.currency}
        accountCreditLimit={account.creditLimit}
        hasExistingPrimary={account.cards.some(
          (c) => c.kind === "CREDIT" && c.isPrimary && c.id !== editCard?.id,
        )}
        initial={editCard}
      />

      <ConfirmDialog
        open={deleteCard !== null}
        onOpenChange={(v) => !v && setDeleteCard(null)}
        title={t("cards.deleteConfirm")}
        loading={remove.isPending}
        onConfirm={() => {
          if (!deleteCard) return;
          remove.mutate(deleteCard.id, {
            onSuccess: () => {
              toast.success(t("cards.deleted"));
              setDeleteCard(null);
            },
            onError: () => toast.error(t("errors.INTERNAL_ERROR")),
          });
        }}
      />
    </div>
  );
}
