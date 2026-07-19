import { ChevronRight, Pencil, Plus, Power, RefreshCw, Trash2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";

import { accounts as accountsContract } from "@finance/contracts";
import type { accounts, transactions } from "@finance/contracts";
import { formatMoney } from "@finance/money";

import { useAuth } from "../../auth/hooks/useAuth";
import { useTransactions } from "../../transactions/hooks/useTransactions";
import { useTransactionMutations } from "../../transactions/hooks/useTransactionMutations";
import { TransactionCreateModal } from "../../transactions/components/TransactionCreateModal";
import { TransactionDetailModal } from "../../transactions/components/TransactionDetailModal";
import { TransactionTable } from "../../transactions/components/TransactionTable";
import { cn } from "../../../shared/lib/cn";
import { Badge } from "../../../shared/ui/badge";
import { Button } from "../../../shared/ui/button";
import { Card, CardContent } from "../../../shared/ui/card";
import { ConfirmDialog } from "../../../shared/ui/confirm-dialog";
import { Select } from "../../../shared/ui/select";
import { EmptyState, ErrorState, LoadingState } from "../../../shared/ui/states";
import { AccountForm } from "../components/AccountForm";
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
  const { data: acc, isLoading, isError } = useAccount(id);
  const { update, setStatus, reconcile, remove } = useAccountMutations();

  if (isLoading) return <LoadingState title={t("app.loading")} />;
  if (isError || !acc) return <ErrorState title={t("errors.INTERNAL_ERROR")} />;

  const Icon = ACCOUNT_ICON[acc.type];
  const pct = acc.balanceChangePct === null ? null : Number(acc.balanceChangePct);

  return (
    <div className="flex flex-col gap-6">
      <nav className="flex items-center gap-1 text-sm text-muted-foreground">
        <Link to="/accounts" className="hover:text-foreground">
          {t("accounts.title")}
        </Link>
        <ChevronRight className="h-4 w-4" aria-hidden />
        <span className="text-foreground">{acc.name}</span>
      </nav>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        {/* Main column */}
        <div className="flex min-w-0 flex-col gap-6">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-muted text-muted-foreground">
                <Icon className="h-6 w-6" aria-hidden />
              </span>
              <div>
                <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
                  {acc.name}
                  <Badge variant={acc.status === "ACTIVE" ? "success" : "neutral"}>
                    {t(`accounts.status.${acc.status}`)}
                  </Badge>
                </h1>
                <p className="text-sm text-muted-foreground">
                  {t(`accounts.type.${acc.type}`)} · {acc.currency}
                  {acc.institution ? ` · ${acc.institution}` : ""}
                  {acc.accountNumber ? ` · ${acc.accountNumber}` : ""}
                </p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setEditing((v) => !v)}>
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
            </div>
          </div>

          {editing ? (
            <Card>
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
              <MovementsSection account={acc} />
            </>
          )}
        </div>

        {/* Side column */}
        <aside className="flex flex-col gap-4">
          <CardsAside account={acc} holder={user?.name ?? undefined} />

          <Card className="p-4">
            <span className="mb-3 block text-sm font-semibold">{t("accounts.detail.info")}</span>
            <dl className="flex flex-col gap-2 text-sm">
              {acc.accountNumber ? (
                <DetailRow label={t("accounts.form.accountNumber")} value={acc.accountNumber} />
              ) : null}
              <DetailRow label={t("accounts.form.type")} value={t(`accounts.type.${acc.type}`)} />
              <DetailRow label={t("accounts.form.currency")} value={acc.currency} />
              <DetailRow label={t("accounts.form.institution")} value={acc.institution ?? "—"} />
              <DetailRow
                label={t("accounts.status.label")}
                value={t(`accounts.status.${acc.status}`)}
              />
              <DetailRow
                label={t("accounts.detail.created")}
                value={new Date(acc.createdAt).toLocaleDateString(i18n.language)}
              />
              <DetailRow
                label={t("accounts.detail.updated")}
                value={new Date(acc.updatedAt).toLocaleDateString(i18n.language)}
              />
            </dl>
          </Card>

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

          <Button
            variant={acc.status === "ACTIVE" ? "destructive" : "outline"}
            className="w-full"
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
            className="w-full text-destructive hover:bg-destructive/10"
            onClick={() => remove.mutate(id, { onSuccess: () => navigate("/accounts") })}
          >
            <Trash2 className="h-4 w-4" aria-hidden />
            {t("accounts.actions.delete")}
          </Button>
        </aside>
      </div>
    </div>
  );
}

function KpiStrip({ account, pct }: { account: accounts.BankAccount; pct: number | null }) {
  const { t, i18n } = useTranslation();
  const fmt = (v: string) => formatMoney(v, { locale: i18n.language, currency: account.currency });
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <Kpi label={t("accounts.currentBalance")} value={fmt(account.currentBalance)} emphasis />
      <Kpi label={t("accounts.form.initialBalance")} value={fmt(account.initialBalance)} />
      <Kpi
        label={t("accounts.detail.change")}
        value={
          pct === null
            ? "—"
            : `${pct > 0 ? "+" : ""}${pct.toLocaleString(i18n.language, { maximumFractionDigits: 1 })}%`
        }
        tone={pct === null ? undefined : pct < 0 ? "danger" : "success"}
      />
    </div>
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
function MovementsSection({ account }: { account: accounts.BankAccount }) {
  const { t } = useTranslation();
  const [cardFilter, setCardFilter] = useState("");
  const { data, isLoading, isError } = useTransactions({
    bankAccountId: account.id,
    cardId: cardFilter || undefined,
  });
  const { remove } = useTransactionMutations();
  const [modalOpen, setModalOpen] = useState(false);
  const [editTx, setEditTx] = useState<transactions.Transaction | null>(null);
  const [deleteTx, setDeleteTx] = useState<transactions.Transaction | null>(null);
  const [detailTx, setDetailTx] = useState<transactions.Transaction | null>(null);
  const list = data ?? [];

  const cardOptions = [
    { value: "", label: t("transactions.form.selectCard") },
    ...account.cards.map((c) => ({ value: c.id, label: `••••${c.last4} · ${c.name}` })),
  ];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">{t("transactions.title")}</h2>
        <div className="flex items-center gap-2">
          {account.cards.length > 0 ? (
            <Select
              className="h-9 w-48"
              value={cardFilter}
              onChange={(e) => setCardFilter(e.target.value)}
              options={cardOptions}
              aria-label={t("transactions.form.selectCard")}
            />
          ) : null}
          <Button
            size="sm"
            onClick={() => {
              setEditTx(null);
              setModalOpen(true);
            }}
          >
            <Plus className="h-4 w-4" aria-hidden />
            {t("transactions.new")}
          </Button>
        </div>
      </div>

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
          onEdit={(tx) => {
            setEditTx(tx);
            setModalOpen(true);
          }}
          onDelete={(tx) => setDeleteTx(tx)}
          onRowClick={(tx) => setDetailTx(tx)}
        />
      )}

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
function CardsAside({ account, holder }: { account: accounts.BankAccount; holder?: string }) {
  const { t } = useTranslation();
  const { remove } = useCardMutations(account.id);
  const [modalOpen, setModalOpen] = useState(false);
  const [editCard, setEditCard] = useState<accounts.Card | undefined>(undefined);
  const [deleteCard, setDeleteCard] = useState<accounts.Card | null>(null);
  const [viewCard, setViewCard] = useState<accounts.Card | null>(null);
  const cardable = accountsContract.isCardableAccountType(account.type);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold">{t("cards.title")}</span>
        {cardable ? (
          <Button
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
        ) : null}
      </div>

      {account.cards.length === 0 ? (
        <AccountVisualCard account={account} holder={holder} />
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

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  );
}
