import { ChevronRight, Pencil, Plus, Power, RefreshCw, Trash2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useParams } from "react-router-dom";

import type { accounts } from "@finance/contracts";
import { formatMoney } from "@finance/money";

import { useAuth } from "../../auth/hooks/useAuth";
import { useTransactions } from "../../transactions/hooks/useTransactions";
import { cn } from "../../../shared/lib/cn";
import { Badge } from "../../../shared/ui/badge";
import { Button } from "../../../shared/ui/button";
import { Card, CardContent } from "../../../shared/ui/card";
import { Tabs } from "../../../shared/ui/tabs";
import { EmptyState, ErrorState, LoadingState } from "../../../shared/ui/states";
import { AccountForm } from "../components/AccountForm";
import { AccountVisualCard } from "../components/AccountVisualCard";
import { CardForm } from "../components/CardForm";
import { ACCOUNT_ICON } from "../components/accountVisuals";
import { useAccount, useAccountMutations } from "../hooks/useAccounts";
import { useCardMutations } from "../hooks/useCards";

type Tab = "transactions" | "cards" | "info";

export function AccountDetailRoute() {
  const { t, i18n } = useTranslation();
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [editing, setEditing] = useState(false);
  const [tab, setTab] = useState<Tab>("transactions");
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
                  initial={{
                    name: acc.name,
                    type: acc.type,
                    status: acc.status,
                    institution: acc.institution ?? "",
                    currency: acc.currency,
                    initialBalance: acc.initialBalance,
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
                          institution: v.institution || undefined,
                          initialBalance: v.initialBalance || "0",
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

              <div className="flex flex-col gap-4">
                <Tabs
                  value={tab}
                  onChange={setTab}
                  items={[
                    { value: "transactions", label: t("transactions.title") },
                    { value: "cards", label: t("cards.title") },
                    { value: "info", label: t("accounts.detail.info") },
                  ]}
                />
                {tab === "transactions" ? (
                  <TransactionsTab accountId={id} currency={acc.currency} />
                ) : null}
                {tab === "cards" ? <CardsTab account={acc} /> : null}
                {tab === "info" ? <InfoTab account={acc} /> : null}
              </div>
            </>
          )}
        </div>

        {/* Side column */}
        <aside className="flex flex-col gap-4">
          <AccountVisualCard account={acc} holder={user?.name ?? undefined} />

          <Card className="p-4">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-sm font-semibold">{t("cards.title")}</span>
              <button
                type="button"
                onClick={() => setTab("cards")}
                className="flex items-center gap-1 text-xs font-medium text-primary hover:underline"
              >
                <Plus className="h-3.5 w-3.5" aria-hidden />
                {t("cards.add")}
              </button>
            </div>
            {acc.cards.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("cards.empty")}</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {acc.cards.map((card) => (
                  <li
                    key={card.id}
                    className="flex items-center justify-between rounded-md border px-3 py-2"
                  >
                    <span className="flex flex-col">
                      <span className="text-sm font-medium">
                        {card.name} <span className="text-muted-foreground">···· {card.last4}</span>
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {t("cards.expires", {
                          date: `${String(card.expiryMonth).padStart(2, "0")}/${card.expiryYear}`,
                        })}
                      </span>
                    </span>
                    <Badge variant="neutral">{t(`cards.kind.${card.kind}`)}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card className="p-4">
            <span className="mb-3 block text-sm font-semibold">{t("accounts.detail.info")}</span>
            <dl className="flex flex-col gap-2 text-sm">
              <DetailRow label={t("accounts.form.currency")} value={acc.currency} />
              <DetailRow label={t("accounts.form.institution")} value={acc.institution ?? "—"} />
              <DetailRow
                label={t("accounts.detail.created")}
                value={new Date(acc.createdAt).toLocaleDateString(i18n.language)}
              />
            </dl>
          </Card>

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

function TransactionsTab({ accountId, currency }: { accountId: string; currency: string }) {
  const { t, i18n } = useTranslation();
  const { data, isLoading, isError } = useTransactions({ bankAccountId: accountId });
  const list = data ?? [];

  if (isLoading) return <LoadingState title={t("app.loading")} />;
  if (isError) return <ErrorState title={t("errors.INTERNAL_ERROR")} />;
  if (list.length === 0) return <EmptyState title={t("transactions.empty")} />;

  return (
    <ul className="divide-y rounded-lg border">
      {list.map((tx) => {
        const income = tx.type === "INCOME";
        return (
          <li key={tx.id} className="flex items-center justify-between px-4 py-3">
            <span className="flex min-w-0 flex-col">
              <span className="truncate text-sm font-medium">
                {tx.description ?? t(`transactions.type.${tx.type}`)}
              </span>
              <span className="text-xs text-muted-foreground">
                {tx.category ?? t("transactions.uncategorized")} ·{" "}
                {new Date(tx.occurredAt).toLocaleDateString(i18n.language)}
              </span>
            </span>
            <span
              className={cn("shrink-0 tabular-nums text-sm font-medium", income && "text-success")}
            >
              {income ? "+" : "−"}
              {formatMoney(tx.amount, { locale: i18n.language, currency: tx.currency || currency })}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function CardsTab({ account }: { account: accounts.BankAccount }) {
  const { t, i18n } = useTranslation();
  const { add, update, remove } = useCardMutations(account.id);
  const [mode, setMode] = useState<{ kind: "none" | "add" | "edit"; card?: accounts.Card }>({
    kind: "none",
  });

  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-end">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setMode(mode.kind === "add" ? { kind: "none" } : { kind: "add" })}
        >
          {mode.kind === "add" ? t("common.cancel") : t("cards.add")}
        </Button>
      </div>

      {account.cards.length === 0 && mode.kind === "none" ? (
        <p className="text-sm text-muted-foreground">{t("cards.empty")}</p>
      ) : null}

      {account.cards.map((card) => (
        <div key={card.id} className="rounded-md border p-3">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <span className="font-medium">{card.name}</span>
              <Badge variant="neutral">{t(`cards.kind.${card.kind}`)}</Badge>
              <span className="text-muted-foreground">···· {card.last4}</span>
              <span className="text-xs text-muted-foreground">
                {String(card.expiryMonth).padStart(2, "0")}/{card.expiryYear}
              </span>
            </span>
            <span className="flex gap-1">
              <Button variant="ghost" size="sm" onClick={() => setMode({ kind: "edit", card })}>
                {t("accounts.actions.edit")}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => remove.mutate(card.id)}>
                {t("accounts.actions.delete")}
              </Button>
            </span>
          </div>
          {card.kind === "CREDIT" && card.limits.length > 0 ? (
            <ul className="mt-2 flex flex-col gap-1 text-sm text-muted-foreground">
              {card.limits.map((l) => (
                <li key={l.currency} className="flex justify-between">
                  <span>{l.currency}</span>
                  <span className="tabular-nums">
                    {formatMoney(l.used, { locale: i18n.language, currency: l.currency })} /{" "}
                    {formatMoney(l.limit, { locale: i18n.language, currency: l.currency })}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ))}

      {mode.kind === "add" ? (
        <CardForm
          submitLabel={t("cards.add")}
          submitting={add.isPending}
          onSubmit={(card) => add.mutate(card, { onSuccess: () => setMode({ kind: "none" }) })}
        />
      ) : null}

      {mode.kind === "edit" && mode.card ? (
        <CardForm
          submitLabel={t("accounts.actions.save")}
          submitting={update.isPending}
          initial={mode.card}
          onSubmit={(card) =>
            update.mutate(
              { cardId: mode.card!.id, body: card },
              { onSuccess: () => setMode({ kind: "none" }) },
            )
          }
        />
      ) : null}
    </div>
  );
}

function InfoTab({ account }: { account: accounts.BankAccount }) {
  const { t, i18n } = useTranslation();
  return (
    <Card className="p-4">
      <dl className="flex flex-col gap-2 text-sm">
        <DetailRow label={t("accounts.form.currency")} value={account.currency} />
        <DetailRow label={t("accounts.form.institution")} value={account.institution ?? "—"} />
        <DetailRow label={t("accounts.form.type")} value={t(`accounts.type.${account.type}`)} />
        <DetailRow
          label={t("accounts.status.label")}
          value={t(`accounts.status.${account.status}`)}
        />
        <DetailRow
          label={t("accounts.detail.created")}
          value={new Date(account.createdAt).toLocaleDateString(i18n.language)}
        />
        <DetailRow
          label={t("accounts.detail.updated")}
          value={new Date(account.updatedAt).toLocaleDateString(i18n.language)}
        />
      </dl>
    </Card>
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
