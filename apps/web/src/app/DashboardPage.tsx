import { type ReactNode, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { useAccounts } from "../domains/accounts/hooks/useAccounts";
import { useAuth } from "../domains/auth/hooks/useAuth";
import { AttentionStrip } from "../domains/dashboard/components/AttentionStrip";
import { CategoryBars } from "../domains/dashboard/components/CategoryBars";
import {
  CategoryRowsSkeleton,
  DashboardSkeleton,
  MonthFlowRowsSkeleton,
} from "../domains/dashboard/components/DashboardSkeleton";
import { MonthFlowSummary } from "../domains/dashboard/components/MonthFlowCard";
import { MonthPicker } from "../shared/ui/month-picker";
import { NetWorthCard } from "../domains/dashboard/components/NetWorthCard";
import { UpcomingPayments } from "../domains/dashboard/components/UpcomingPaymentsCard";
import { WalletCards } from "../domains/dashboard/components/WalletCards";
import { useDueStatements } from "../domains/dashboard/hooks/useDueStatements";
import {
  attentionItems,
  endOfMonthISO,
  expensesByCategory,
  monthFlow,
  netWorth,
  secondaryTotals,
  seriesEnd,
  seriesStart,
  startOfMonthISO,
  upcomingPayments,
} from "../domains/dashboard/lib/metrics";
import { useDebts } from "../domains/debts/hooks/useDebts";
import { useInstallments } from "../domains/installments/hooks/useInstallments";
import { useRecurring } from "../domains/recurring/hooks/useRecurring";
import { useTransactions } from "../domains/transactions/hooks/useTransactions";
import { cn } from "@finance/ui/src/shared/lib/cn";
import { useElementWidth } from "../shared/lib/useElementWidth";
import { useMediaQuery } from "@finance/ui/src/shared/lib/useMediaQuery";
import { Card } from "../shared/ui/card";
import { Segmented } from "../shared/ui/segmented";
import { ErrorState } from "../shared/ui/states";

/** Content width from which the Panel gets its two-column desktop layout, and below which it
 * becomes the phone layout (tabs instead of one long column). Measured on the Panel itself,
 * like the app's tables: the same screen gives less room with the sidebar open. */
const WIDE_MIN = 1100;
const PHONE_MAX = 640;
/** Viewport height from which the wide Panel fits one screen without scrolling. Below it the
 * chart and lists would be squeezed flat, so the page scrolls as usual. A height, not one of
 * the width breakpoints in `breakpoints.ts`. On a short window the net-worth chart shrinks so
 * the month and payments boxes keep 14rem (title + about four rows). */
const FIT_QUERY = "(min-height: 720px)";

type PhoneTab = "month" | "payments" | "wallet";

/**
 * The Panel ("D1, lo urgente primero"): first what needs a decision soon, then net worth with a
 * real chart, then the month (what came in and out, where it went), then upcoming payments and
 * the wallet. Same order at every width; only the arrangement changes:
 *  - wide: urgent cards in a row; net worth beside the month; payments beside the wallet;
 *  - medium: urgent cards scroll sideways; net worth full width; month and categories side by side;
 *  - phone: urgent cards as a carousel ("1 de 3"), a compact chart, and Mes / Pagos / Cartera as
 *    tabs instead of a column that never ends.
 * "Nuevo movimiento" lives in the sidebar / tab bar, not here.
 */
export function DashboardPage() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const [ref, width] = useElementWidth();
  const tallEnough = useMediaQuery(FIT_QUERY);
  const now = useMemo(() => new Date(), []);
  const [viewMonth, setViewMonth] = useState(() => new Date(now.getFullYear(), now.getMonth(), 1));
  const [phoneTab, setPhoneTab] = useState<PhoneTab>("month");

  const isCurrentMonth =
    viewMonth.getFullYear() === now.getFullYear() && viewMonth.getMonth() === now.getMonth();

  const accountsQuery = useAccounts();
  const txQuery = useTransactions({
    from: startOfMonthISO(viewMonth),
    to: endOfMonthISO(viewMonth),
  });
  // The net-worth chart walks back from today over the last 30 days of movements. Day bounds, so
  // the query key (and its cache) is the same on every visit during the day.
  const recentQuery = useTransactions({
    from: seriesStart(now).toISOString(),
    to: seriesEnd(now).toISOString(),
  });
  const installmentsQuery = useInstallments();
  const debtsQuery = useDebts();
  const recurringQuery = useRecurring();

  const accountList = accountsQuery.data ?? [];
  const txs = txQuery.data ?? [];
  const dueStatements = useDueStatements(accountList);
  // Everything the Panel adds up, except the month's own movements: until ALL of it is here the
  // whole Panel stays a skeleton. Gating on the accounts alone showed "$0", "nothing due" and a
  // net worth without debts whenever the accounts were already cached (arriving from another
  // section) and the rest was still on its way.
  const loadingTotals =
    accountsQuery.isLoading ||
    recentQuery.isLoading ||
    installmentsQuery.isLoading ||
    debtsQuery.isLoading ||
    recurringQuery.isLoading ||
    dueStatements.loading;
  // The month's movements load on their own (picking another month): only its block waits.
  const loadingMonth = txQuery.isLoading;

  const worth = useMemo(
    () =>
      netWorth(
        accountList,
        debtsQuery.data ?? [],
        recentQuery.data ? { txs: recentQuery.data, now } : null,
      ),
    [accountList, debtsQuery.data, recentQuery.data, now],
  );
  const secondary = useMemo(
    () => secondaryTotals(accountList, debtsQuery.data ?? []),
    [accountList, debtsQuery.data],
  );
  const flow = useMemo(() => monthFlow(txs), [txs]);
  const categories = useMemo(() => expensesByCategory(txs), [txs]);
  const upcoming = useMemo(
    () =>
      upcomingPayments(
        installmentsQuery.data ?? [],
        debtsQuery.data ?? [],
        recurringQuery.data ?? [],
        now,
      ),
    [installmentsQuery.data, debtsQuery.data, recurringQuery.data, now],
  );
  const attention = attentionItems(dueStatements.items, upcoming, now);

  const firstName = user?.name?.trim().split(/\s+/)[0];
  const monthName = viewMonth.toLocaleDateString(i18n.language, { month: "long" });
  const layout =
    width === null || width < PHONE_MAX ? "phone" : width < WIDE_MIN ? "medium" : "wide";
  // Wide AND tall enough: the whole Panel fits one screen, each column scrolling inside itself.
  const fit = layout === "wide" && tallEnough;

  const monthBlock = (
    <Section title={monthName} className="first-letter:uppercase">
      {loadingMonth ? <MonthFlowRowsSkeleton /> : <MonthFlowSummary flow={flow} />}
    </Section>
  );
  const categoriesBlock = (
    <Section title={t("dashboard.spendByCategory")}>
      {loadingMonth ? <CategoryRowsSkeleton /> : <CategoryBars slices={categories} />}
    </Section>
  );
  const paymentsBlock = (
    <Section title={t("dashboard.upcoming")}>
      <UpcomingPayments items={upcoming} />
    </Section>
  );
  const walletBlock = (
    <WalletCards accountList={accountList} holder={user?.name ?? undefined} fill={fit} />
  );

  return (
    <div
      ref={ref}
      // One screen on a wide, tall-enough view: never taller than the main area (100dvh less the
      // shell's own py-6), otherwise as tall as its content — the grid's tallest column, usually
      // the wallet, so on a tall window every box shows whole with no scroll inside and the
      // Panel stops there instead of stretching. Only the grid gives way on a shorter window.
      className={cn(
        "flex flex-col",
        fit ? "max-h-[calc(100dvh-3rem)] gap-4 [&>*]:shrink-0" : "gap-5",
      )}
    >
      <header className="flex shrink-0 flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">
            {firstName ? t("dashboard.greeting", { name: firstName }) : t("dashboard.title")}
          </h1>
          {/* first-letter only: `capitalize` would give "Martes, 6 De Octubre". */}
          <p className="mt-0.5 text-sm text-muted-foreground first-letter:uppercase">
            {now.toLocaleDateString(i18n.language, {
              weekday: "long",
              day: "numeric",
              month: "long",
            })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isCurrentMonth ? null : (
            <button
              type="button"
              onClick={() => setViewMonth(new Date(now.getFullYear(), now.getMonth(), 1))}
              className="text-sm font-medium text-primary hover:underline"
            >
              {t("dashboard.backToThisMonth")}
            </button>
          )}
          <MonthPicker
            value={viewMonth}
            onChange={setViewMonth}
            prevLabel={t("dashboard.prevMonth")}
            nextLabel={t("dashboard.nextMonth")}
          />
        </div>
      </header>

      {loadingTotals ? (
        <DashboardSkeleton label={t("app.loading")} layout={layout} fit={fit} />
      ) : accountsQuery.isError ? (
        <ErrorState error={accountsQuery.error} onRetry={() => accountsQuery.refetch()} />
      ) : (
        <>
          <AttentionStrip
            items={attention}
            now={now}
            layout={layout === "wide" ? "row" : "scroll"}
            showCount={layout === "phone"}
            dense={fit}
          />

          {fit ? (
            // Net worth across two columns (a line chart reads best wide and low, never
            // stretched tall), the month and the payments under it, the wallet down the right.
            // Rows: the height is split 1.3 : 1 between net worth (its chart takes whatever its
            // text leaves) and the month/payments row, which never goes under 14rem (title +
            // about four rows) — on a short window the chart gives way, on a tall one both grow
            // instead of the bottom boxes stretching empty. Each box scrolls inside.
            <div className="grid min-h-0 !shrink grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,0.85fr)] grid-rows-[minmax(0,1.3fr)_minmax(14rem,1fr)] gap-4">
              <div className="col-span-2 min-h-0">
                <NetWorthCard worth={worth} secondary={secondary} fill />
              </div>
              <div className="row-span-2 flex min-h-0 flex-col">{walletBlock}</div>
              <Card className="flex min-h-0 flex-col p-5">
                <div className="scrollbar-thin -mr-2 flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto pr-2">
                  {monthBlock}
                  {categoriesBlock}
                </div>
              </Card>
              <Card className="flex min-h-0 flex-col p-5">
                <Section title={t("dashboard.upcoming")} fill>
                  <UpcomingPayments items={upcoming} />
                </Section>
              </Card>
            </div>
          ) : layout === "wide" ? (
            <>
              <div className="grid grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] gap-5">
                <NetWorthCard worth={worth} secondary={secondary} chartHeight={200} />
                <Card className="flex flex-col gap-5 p-5">
                  {monthBlock}
                  {categoriesBlock}
                </Card>
              </div>
              <div className="grid grid-cols-2 items-start gap-5">
                <Card className="p-5">{paymentsBlock}</Card>
                {walletBlock}
              </div>
            </>
          ) : layout === "medium" ? (
            <>
              <NetWorthCard worth={worth} secondary={secondary} chartHeight={170} />
              <div className="grid grid-cols-2 gap-4">
                <Card className="p-5">{monthBlock}</Card>
                <Card className="p-5">{categoriesBlock}</Card>
              </div>
              <Card className="p-5">{paymentsBlock}</Card>
              {walletBlock}
            </>
          ) : (
            <>
              <NetWorthCard worth={worth} secondary={secondary} compact chartHeight={110} />
              <Segmented<PhoneTab>
                aria-label={t("dashboard.tabs.label")}
                variant="neutral"
                value={phoneTab}
                onChange={setPhoneTab}
                className="flex w-full"
                options={[
                  { value: "month", label: t("dashboard.tabs.month") },
                  { value: "payments", label: t("dashboard.tabs.payments") },
                  { value: "wallet", label: t("dashboard.tabs.wallet") },
                ]}
              />
              {phoneTab === "month" ? (
                <Card className="flex flex-col gap-5 p-4">
                  {monthBlock}
                  {categoriesBlock}
                </Card>
              ) : phoneTab === "payments" ? (
                <Card className="p-4">{paymentsBlock}</Card>
              ) : (
                walletBlock
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}

/** A titled block inside a Panel card (the card is the caller's: some blocks share one).
 * `fill` takes the card's remaining height and scrolls its content inside it. */
function Section({
  title,
  className,
  fill = false,
  children,
}: Readonly<{ title: string; className?: string; fill?: boolean; children: ReactNode }>) {
  return (
    <section className={cn("flex flex-col gap-3", fill && "min-h-0 flex-1")}>
      <h2 className={cn("shrink-0 text-sm font-semibold", className)}>{title}</h2>
      {fill ? (
        <div className="scrollbar-thin -mr-2 min-h-0 flex-1 overflow-y-auto pr-2">{children}</div>
      ) : (
        children
      )}
    </section>
  );
}
