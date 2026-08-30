import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { useAccounts } from "../domains/accounts/hooks/useAccounts";
import { useAuth } from "../domains/auth/hooks/useAuth";
import { CategoryDonut } from "../domains/dashboard/components/CategoryDonut";
import { DashboardSkeleton } from "../domains/dashboard/components/DashboardSkeleton";
import { MonthFlowCard } from "../domains/dashboard/components/MonthFlowCard";
import { NetWorthCard } from "../domains/dashboard/components/NetWorthCard";
import { UpcomingPaymentsCard } from "../domains/dashboard/components/UpcomingPaymentsCard";
import { WalletCards } from "../domains/dashboard/components/WalletCards";
import {
  endOfMonthISO,
  expensesByCategory,
  monthFlow,
  netWorth,
  secondaryTotals,
  startOfMonthISO,
  upcomingPayments,
} from "../domains/dashboard/lib/metrics";
import { useDebts } from "../domains/debts/hooks/useDebts";
import { useInstallments } from "../domains/installments/hooks/useInstallments";
import { useRecurring } from "../domains/recurring/hooks/useRecurring";
import { TransactionCreateModal } from "../domains/transactions/components/TransactionCreateModal";
import { useTransactions } from "../domains/transactions/hooks/useTransactions";
import { Button } from "../shared/ui/button";
import { PageHeader } from "../shared/ui/page-header";
import { ErrorState } from "../shared/ui/states";

export function DashboardPage() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const [modalOpen, setModalOpen] = useState(false);
  const now = useMemo(() => new Date(), []);
  const [viewMonth, setViewMonth] = useState(() => new Date(now.getFullYear(), now.getMonth(), 1));

  const isCurrentMonth =
    viewMonth.getFullYear() === now.getFullYear() && viewMonth.getMonth() === now.getMonth();

  function shiftMonth(delta: number) {
    setViewMonth((d) => new Date(d.getFullYear(), d.getMonth() + delta, 1));
  }

  const accountsQuery = useAccounts();
  const txQuery = useTransactions({
    from: startOfMonthISO(viewMonth),
    to: endOfMonthISO(viewMonth),
  });
  const installmentsQuery = useInstallments();
  const debtsQuery = useDebts();
  const recurringQuery = useRecurring();

  const accountList = accountsQuery.data ?? [];
  const txs = txQuery.data ?? [];

  const worth = useMemo(
    () => netWorth(accountList, debtsQuery.data ?? []),
    [accountList, debtsQuery.data],
  );
  const secondary = useMemo(() => secondaryTotals(accountList), [accountList]);
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

  const period = viewMonth.toLocaleDateString(i18n.language, { month: "long", year: "numeric" });

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title={t("dashboard.title")}
        actions={
          <>
            <div className="flex items-center gap-1 rounded-md border border-input">
              <button
                type="button"
                aria-label={t("dashboard.prevMonth")}
                onClick={() => shiftMonth(-1)}
                className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <ChevronLeft className="h-4 w-4" aria-hidden />
              </button>
              <button
                type="button"
                disabled={isCurrentMonth}
                onClick={() => setViewMonth(new Date(now.getFullYear(), now.getMonth(), 1))}
                title={t("dashboard.thisMonth")}
                className="min-w-[9rem] px-1 text-sm font-medium capitalize disabled:cursor-default"
              >
                {period}
              </button>
              <button
                type="button"
                aria-label={t("dashboard.nextMonth")}
                onClick={() => shiftMonth(1)}
                className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <ChevronRight className="h-4 w-4" aria-hidden />
              </button>
            </div>
            <Button variant="accent" onClick={() => setModalOpen(true)}>
              <Plus className="h-4 w-4" aria-hidden />
              {t("transactions.new")}
            </Button>
          </>
        }
      />

      <TransactionCreateModal open={modalOpen} onOpenChange={setModalOpen} />

      {accountsQuery.isLoading ? (
        <DashboardSkeleton label={t("app.loading")} />
      ) : accountsQuery.isError ? (
        <ErrorState error={accountsQuery.error} onRetry={() => accountsQuery.refetch()} />
      ) : (
        <div className="grid gap-5 lg:grid-cols-[1.25fr_1fr]">
          <div className="flex flex-col gap-5">
            <NetWorthCard worth={worth} secondary={secondary} />
            <WalletCards accountList={accountList} holder={user?.name ?? undefined} />
          </div>
          <div className="flex flex-col gap-3">
            <MonthFlowCard flow={flow} />
            <CategoryDonut slices={categories} />
            <UpcomingPaymentsCard items={upcoming} />
          </div>
        </div>
      )}
    </div>
  );
}
