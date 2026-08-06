import { ChevronLeft, ChevronRight, Lock, Power, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useBlocker, useNavigate, useParams } from "react-router";
import { toast } from "sonner";

import type { accounts } from "@finance/contracts";
import { formatMoney } from "@finance/money";

import { ApiRequestError } from "../../../shared/lib/apiClient";
import { cn } from "../../../shared/lib/cn";
import { useMediaQuery } from "../../../shared/lib/useMediaQuery";
import { ASIDE_MIN_WIDTH, useElementWidth } from "../../../shared/lib/useElementWidth";
import { Badge } from "../../../shared/ui/badge";
import { Button } from "../../../shared/ui/button";
import { Card } from "../../../shared/ui/card";
import { ConfirmModal, SHEET_QUERY, WindowScreen } from "../../../shared/ui/overlay";
import { ErrorState, LoadingState } from "../../../shared/ui/states";
import { UnsavedIndicator } from "../../../shared/ui/unsaved-indicator";
import { AccountForm } from "../components/AccountForm";
import { ACCOUNT_ICON } from "../components/accountVisuals";
import { useAccount, useAccountMutations } from "../hooks/useAccounts";

/** Ties the window footer's submit button to the form it lives outside of. */
const FORM_ID = "account-edit-form";

/**
 * Editing an account is its own screen rather than a panel inside the detail
 * view: the form is long (identification + credit pool + billing + status) and
 * the detail view's own scroll containers fought it. The cards column here is
 * deliberately read-only — a card's limit is edited from the card itself, so
 * showing it as context prevents the "why can't I change this here?" dead end.
 */
export function AccountEditRoute() {
  const { t, i18n } = useTranslation();
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const { data: acc, isLoading, isError } = useAccount(id);
  const { update, setStatus, remove } = useAccountMutations();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const shellRef = useRef<HTMLDivElement>(null);
  const shellWidth = useElementWidth(shellRef);
  // Same rule as the detail view: the read-only cards column appears when THIS
  // view is wide enough, which the collapsible sidebar changes on its own.
  const isDesktop = shellWidth !== null && shellWidth >= ASIDE_MIN_WIDTH;
  // Below this the whole route renders as a window instead of a page.
  const roomForPage = useMediaQuery(SHEET_QUERY);
  // Leaving on purpose (saved, or the discard already confirmed) must stand the
  // guard down. It's a ref, not state: `navigate()` runs in the same tick as the
  // decision, before a state update could re-render — with state the blocker was
  // still armed and re-opened the very dialog the user had just confirmed.
  const leavingRef = useRef(false);
  // In-app navigation (the sidebar, the breadcrumb, browser back) is intercepted
  // by the router; a reload/tab close can only be caught by the native prompt.
  const blocker = useBlocker(() => dirty && !leavingRef.current);

  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    globalThis.addEventListener("beforeunload", onBeforeUnload);
    return () => globalThis.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  if (isLoading) return <LoadingState title={t("app.loading")} />;
  if (isError || !acc) return <ErrorState title={t("errors.INTERNAL_ERROR")} />;

  const Icon = ACCOUNT_ICON[acc.type];
  const leave = () => {
    leavingRef.current = true;
    navigate(`/accounts/${id}`);
  };
  /** The user asked to go back: confirm first when there's something to lose. */
  const back = () => {
    if (dirty && !leavingRef.current) setConfirmLeave(true);
    else leave();
  };

  function fail(err: unknown) {
    const code = err instanceof ApiRequestError ? err.code : "INTERNAL_ERROR";
    toast.error(t(`errors.${code}`, { defaultValue: t("errors.INTERNAL_ERROR") }));
  }

  const formEl = (
    <AccountForm
      formId={FORM_ID}
      hideFooter={!roomForPage}
      submitLabel={t("accounts.actions.save")}
      submitting={update.isPending}
      hasCreditCard={acc.cards.some((c) => c.kind === "CREDIT")}
      onCancel={back}
      onDirtyChange={setDirty}
      dangerZone={
        <Button
          type="button"
          variant="outline"
          disabled={remove.isPending}
          onClick={() => setConfirmDelete(true)}
          className="w-full border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
        >
          <Trash2 className="h-4 w-4" aria-hidden />
          {t("accounts.edit.deleteAccount")}
        </Button>
      }
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
          {
            onSuccess: () => {
              toast.success(t("accounts.updated"));
              leave();
            },
            onError: fail,
          },
        )
      }
    />
  );

  const dialogs = (
    <>
      <ConfirmModal
        open={confirmLeave || blocker.state === "blocked"}
        onOpenChange={(v) => {
          if (v) return;
          setConfirmLeave(false);
          // Dismissing a blocked navigation must release it, or every later
          // attempt to leave is silently swallowed.
          if (blocker.state === "blocked") blocker.reset();
        }}
        title={t("accounts.edit.leaveConfirm")}
        description={t("accounts.edit.leaveConfirmDescription")}
        confirmLabel={t("accounts.edit.leaveDiscard")}
        onConfirm={() => {
          setConfirmLeave(false);
          leavingRef.current = true;
          // A blocked navigation already has a destination — resume it instead of
          // pushing our own, or the user lands somewhere they didn't ask for.
          if (blocker.state === "blocked") blocker.proceed();
          else navigate(`/accounts/${id}`);
        }}
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
              // Deleting discards the edits by definition — don't ask again.
              leavingRef.current = true;
              navigate("/accounts");
            },
            onError: fail,
          })
        }
      />
    </>
  );

  // On a phone this route IS a window: same chrome as every overlay in the app
  // (fixed header, single scrolling body, pinned action bar), just reached by
  // navigating instead of by opening. Above `sm` it's an ordinary page.
  if (!roomForPage) {
    return (
      <>
        <WindowScreen
          title={t("accounts.edit.titleMobile")}
          description={acc.name}
          leading={
            <Button variant="ghost" size="sm" onClick={back} aria-label={t("common.cancel")}>
              <ChevronLeft className="h-5 w-5" aria-hidden />
            </Button>
          }
          headerAside={<UnsavedIndicator visible={dirty} />}
          footer={
            <Button
              type="submit"
              form={FORM_ID}
              variant="accent"
              disabled={update.isPending}
              className="h-[50px] w-full text-base"
            >
              {t("accounts.actions.save")}
            </Button>
          }
        >
          {formEl}
        </WindowScreen>
        {dialogs}
      </>
    );
  }

  return (
    <>
      <div className="flex flex-col gap-4">
        <nav className="flex items-center gap-1 text-sm text-muted-foreground">
          <Link to="/accounts" className="hover:text-foreground">
            {t("accounts.title")}
          </Link>
          <ChevronRight className="h-4 w-4" aria-hidden />
          <Link to={`/accounts/${id}`} className="hover:text-foreground">
            {acc.name}
          </Link>
        </nav>

        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between lg:gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground">
              <Icon className="h-6 w-6" aria-hidden />
            </span>
            <div className="min-w-0">
              <h1 className="flex flex-wrap items-center gap-2 text-2xl font-semibold tracking-tight">
                <span className="min-w-0 break-words">
                  {t("accounts.edit.title")} · {acc.name}
                </span>
                <Badge variant={acc.status === "ACTIVE" ? "success" : "neutral"}>
                  {t(`accounts.status.${acc.status}`)}
                </Badge>
              </h1>
              <p className="truncate text-sm text-muted-foreground">
                <span className="">
                  {t(`accounts.type.${acc.type}`)} · {acc.currency}
                  {acc.institution ? ` · ${acc.institution}` : ""}
                  {acc.cards.length ? ` · ${t("cards.count", { count: acc.cards.length })}` : ""}
                </span>
              </p>
            </div>
            {/* The phone header has no action row, so the marker rides here — it
                stays visible while the long form scrolls under it. */}
            <UnsavedIndicator visible={dirty} className="ml-auto shrink-0 sm:hidden" />
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <UnsavedIndicator visible={dirty} className="mr-2" />
            <Button
              variant="ghost"
              size="sm"
              className={
                acc.status === "ACTIVE"
                  ? "text-warning hover:bg-warning/10 hover:text-warning"
                  : "text-success hover:bg-success/10 hover:text-success"
              }
              disabled={setStatus.isPending}
              onClick={() =>
                setStatus.mutate(
                  { id, status: acc.status === "ACTIVE" ? "INACTIVE" : "ACTIVE" },
                  { onError: fail },
                )
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
              disabled={remove.isPending}
              onClick={() => setConfirmDelete(true)}
            >
              <Trash2 className="h-4 w-4" aria-hidden />
              {t("accounts.actions.delete")}
            </Button>
          </div>
        </div>

        <div className={cn("grid gap-6", isDesktop && "grid-cols-[1fr_320px]")}>
          <Card className="min-w-0 overflow-visible p-0">{formEl}</Card>

          {/* Desktop only, and genuinely not rendered below `2xl` (not just hidden):
              it's read-only context for the side column, so on a phone/tablet it
              would be a block of cards the user can't act on padding the form. */}
          {isDesktop && acc.cards.length ? (
            <CardsReadOnlyAside account={acc} locale={i18n.language} />
          ) : null}
        </div>
      </div>

      {dialogs}
    </>
  );
}

/** Context only: each card's own limit is edited from the card's detail modal. */
function CardsReadOnlyAside({
  account,
  locale,
}: Readonly<{ account: accounts.BankAccount; locale: string }>) {
  const { t } = useTranslation();

  return (
    <aside className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">{t("cards.title")}</h2>
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          <Lock className="h-3 w-3" aria-hidden />
          {t("accounts.edit.cardsNotEditable")}
        </span>
      </div>
      <p className="rounded-lg border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
        {t("accounts.edit.cardsAsideHint")}
      </p>
      {account.cards.map((card) => {
        const limit = Number(account.creditLimit || 0);
        const used = Number(card.ownUsed || 0);
        const pct = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
        return (
          <Card key={card.id} className="flex flex-col gap-2 p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{card.name}</p>
                <p className="text-xs text-muted-foreground">
                  {t(`cards.kind.${card.kind}`)} · {account.currency}
                </p>
              </div>
              <Badge variant="neutral">{t(`cards.kind.${card.kind}`)}</Badge>
            </div>
            <p className="font-mono text-sm tracking-widest text-muted-foreground">
              •••• {card.last4}
            </p>
            {card.kind === "CREDIT" ? (
              <div>
                <p className="text-xs text-muted-foreground">{t("accounts.card.creditUsed")}</p>
                <p className="text-sm font-semibold tabular-nums">
                  {formatMoney(card.ownUsed ?? "0", { currency: account.currency, locale })}
                  <span className="ml-1 text-xs font-normal text-muted-foreground">
                    / {formatMoney(account.creditLimit, { currency: account.currency, locale })}
                  </span>
                </p>
                <div className="mt-1 flex items-center gap-2">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-track">
                    <div className="h-full rounded-full bg-brand" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="text-xs text-muted-foreground">{pct}%</span>
                </div>
              </div>
            ) : null}
          </Card>
        );
      })}
    </aside>
  );
}
