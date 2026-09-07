import { Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import type { savings } from "@finance/contracts";

import { useAccounts } from "../../accounts/hooks/useAccounts";
import { useAuth } from "../../auth/hooks/useAuth";
import { ApiRequestError } from "../../../shared/lib/apiClient";
import { Button } from "../../../shared/ui/button";
import { PageHeader } from "../../../shared/ui/page-header";
import { EmptyState, ErrorState, LoadingState } from "../../../shared/ui/states";
import { ClosedGoalsSection } from "../components/ClosedGoalsSection";
import { FreeSavingsSection } from "../components/FreeSavingsSection";
import {
  defaultCloseValue,
  SavingsGoalClosePanel,
  type CloseDestination,
  type SavingsGoalCloseValue,
} from "../components/SavingsGoalClosePanel";
import { SavingsGoalDetailPanel } from "../components/SavingsGoalDetailPanel";
import {
  emptySavingsGoalForm,
  SavingsGoalFormPanel,
  savingsGoalFormFrom,
  type SavingsGoalFormValue,
} from "../components/SavingsGoalFormPanel";
import { SavingsGoalRow } from "../components/SavingsGoalRow";
import { SavingsGroupHeader } from "../components/SavingsGroupHeader";
import {
  emptySavingsEntryForm,
  SavingsEntryFormPanel,
  type SavingsEntryFormValue,
} from "../components/SavingsEntryFormPanel";
import { SavingsTotalCard } from "../components/SavingsTotalCard";
import {
  useSavingsEntries,
  useSavingsGoals,
  useSavingsMutations,
  useSavingsSummary,
} from "../hooks/useSavings";
import { goalStatus, groupGoals, isGoalComplete } from "../lib/savingsMetrics";

const todayInput = () => new Date().toISOString().slice(0, 10);

function errorMessage(error: unknown, t: (key: string) => string): string {
  return error instanceof ApiRequestError ? t(`errors.${error.code}`) : t("errors.INTERNAL_ERROR");
}

export function SavingsRoute() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const preferredCurrency = user?.preferredCurrency ?? "CLP";

  const {
    data: goalsData,
    isLoading: goalsLoading,
    isError: goalsError,
    error: goalsErr,
    refetch,
  } = useSavingsGoals();
  const { data: entriesData } = useSavingsEntries();
  const { data: summaryData } = useSavingsSummary();
  const mutations = useSavingsMutations();
  const { data: accountsData } = useAccounts();

  const goals = useMemo(() => (goalsError ? [] : (goalsData ?? [])), [goalsData, goalsError]);
  const entries = useMemo(() => entriesData ?? [], [entriesData]);
  const accounts = accountsData ?? [];

  const openGoals = useMemo(() => goals.filter((g) => g.closedAt === null), [goals]);
  const closedGoals = useMemo(() => goals.filter((g) => g.closedAt !== null), [goals]);
  const groups = useMemo(() => groupGoals(goals), [goals]);
  const freeEntries = useMemo(() => entries.filter((e) => e.savingsGoalId === null), [entries]);

  const [selectedGoalId, setSelectedGoalId] = useState<string | null>(null);
  const [goalForm, setGoalForm] = useState<{ mode: "create" | "edit"; id: string | null } | null>(
    null,
  );
  const [goalFormValue, setGoalFormValue] = useState<SavingsGoalFormValue>(() =>
    emptySavingsGoalForm(preferredCurrency),
  );
  const [entryForm, setEntryForm] = useState<SavingsEntryFormValue | null>(null);
  const [closeTarget, setCloseTarget] = useState<savings.SavingsGoal | null>(null);
  const [closeValue, setCloseValue] = useState<SavingsGoalCloseValue | null>(null);

  const selectedGoal = goals.find((g) => g.id === selectedGoalId) ?? null;

  function openCreateGoal() {
    setGoalFormValue(emptySavingsGoalForm(preferredCurrency));
    setGoalForm({ mode: "create", id: null });
  }

  function openEditGoal(g: savings.SavingsGoal) {
    setGoalFormValue(savingsGoalFormFrom(g));
    setGoalForm({ mode: "edit", id: g.id });
  }

  function submitGoalForm() {
    if (!goalForm) return;
    const title = goalFormValue.title.trim();
    const targetAmount = goalFormValue.targetAmount.trim();
    const currency = goalFormValue.currency.trim().toUpperCase();
    const notes = goalFormValue.notes.trim() || undefined;

    if (goalForm.mode === "edit" && goalForm.id) {
      mutations.updateGoal.mutate(
        {
          id: goalForm.id,
          body: {
            title,
            targetAmount,
            currency,
            deadline: goalFormValue.deadline
              ? new Date(`${goalFormValue.deadline}T00:00:00`).toISOString()
              : null,
            notes,
            color: goalFormValue.color,
          },
        },
        {
          onSuccess: () => {
            toast.success(t("savings.updated"));
            setGoalForm(null);
          },
          onError: (err: unknown) => toast.error(errorMessage(err, t)),
        },
      );
      return;
    }

    mutations.createGoal.mutate(
      {
        title,
        targetAmount,
        currency,
        deadline: goalFormValue.deadline
          ? new Date(`${goalFormValue.deadline}T00:00:00`).toISOString()
          : undefined,
        notes,
        color: goalFormValue.color ?? undefined,
      },
      {
        onSuccess: () => {
          toast.success(t("savings.created"));
          setGoalForm(null);
        },
        onError: (err: unknown) => toast.error(errorMessage(err, t)),
      },
    );
  }

  function openContribute(goalId: string | null) {
    setEntryForm(emptySavingsEntryForm(todayInput(), goalId ?? ""));
  }

  function submitEntryForm() {
    if (!entryForm) return;
    // The account is what actually decides the currency (the backend
    // validates against it) — never the user's preferred one, which would be
    // wrong the moment an aporte comes from an account in another currency.
    const entryCurrency =
      accounts.find((a) => a.id === entryForm.bankAccountId)?.currency ?? preferredCurrency;
    mutations.createEntry.mutate(
      {
        body: {
          amount: entryForm.amount.trim(),
          currency: entryCurrency,
          contributedAt: new Date(`${entryForm.contributedAt}T00:00:00`).toISOString(),
          savingsGoalId: entryForm.savingsGoalId || undefined,
          bankAccountId: entryForm.bankAccountId,
          title: entryForm.title.trim() || undefined,
          note: entryForm.note.trim() || undefined,
        },
        idempotencyKey: crypto.randomUUID(),
      },
      {
        onSuccess: () => {
          toast.success(t("savings.entry.registered"));
          setEntryForm(null);
        },
        onError: (err: unknown) => toast.error(errorMessage(err, t)),
      },
    );
  }

  function openClose(g: savings.SavingsGoal) {
    const complete = isGoalComplete(goalStatus(g, new Date()));
    setCloseTarget(g);
    setCloseValue(defaultCloseValue(complete, todayInput()));
  }

  function submitClose() {
    if (!closeTarget || !closeValue) return;
    const destination = closeValue.destination as CloseDestination;
    const closedAt = new Date(`${closeValue.closedAt}T00:00:00`).toISOString();
    let body: savings.CloseSavingsGoal;
    if (destination === "WITHDRAW_TO_ACCOUNT") {
      body = { destination, accountId: closeValue.accountId, closedAt };
    } else if (destination === "TRANSFER_TO_GOAL") {
      body = { destination, targetGoalId: closeValue.targetGoalId, closedAt };
    } else {
      body = { destination, closedAt };
    }

    mutations.closeGoal.mutate(
      { id: closeTarget.id, idempotencyKey: crypto.randomUUID(), body },
      {
        onSuccess: () => {
          toast.success(t("savings.closedToast", { title: closeTarget.title }));
          setCloseTarget(null);
          setCloseValue(null);
          if (selectedGoalId === closeTarget.id) setSelectedGoalId(null);
        },
        onError: (err: unknown) => toast.error(errorMessage(err, t)),
      },
    );
  }

  function reopenGoal(g: savings.SavingsGoal) {
    mutations.reopenGoal.mutate(
      { id: g.id, idempotencyKey: crypto.randomUUID() },
      {
        onSuccess: () => toast.success(t("savings.reopened", { title: g.title })),
        onError: (err: unknown) => toast.error(errorMessage(err, t)),
      },
    );
  }

  const missing = summaryData?.missing ?? "0";

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t("savings.title")}
        description={
          !goalsLoading && !goalsError
            ? t("savings.subtitle", { count: openGoals.length, missing })
            : undefined
        }
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => openContribute(null)}>
              <Plus className="h-3.5 w-3.5" aria-hidden />
              {t("savings.freeContribution")}
            </Button>
            <Button variant="accent" onClick={openCreateGoal}>
              <Plus className="h-4 w-4" aria-hidden />
              {t("savings.new")}
            </Button>
          </div>
        }
      />

      {goalsLoading && <LoadingState title={t("app.loading")} />}
      {!goalsLoading && goalsError && <ErrorState error={goalsErr} onRetry={() => refetch()} />}
      {!goalsLoading && !goalsError && goals.length === 0 && freeEntries.length === 0 && (
        <EmptyState title={t("savings.empty")} />
      )}

      {!goalsLoading && !goalsError && (goals.length > 0 || freeEntries.length > 0) ? (
        <>
          {summaryData ? (
            <SavingsTotalCard
              summary={summaryData}
              openGoals={openGoals}
              closedGoals={closedGoals}
              entries={entries}
              currency={preferredCurrency}
            />
          ) : null}

          {(["live", "late", "done"] as const).map((key) =>
            groups[key].length > 0 ? (
              <div key={key} className="flex flex-col gap-2">
                <SavingsGroupHeader
                  title={t(`savings.groups.${key}`)}
                  amounts={groups[key].map((g) => g.goal.savedAmount)}
                  currency={preferredCurrency}
                />
                <div className="overflow-hidden rounded-[9.6px] border border-border bg-card shadow-[0_1px_2px_rgba(0,0,0,0.28)] [&>*]:last:border-b-0">
                  {groups[key].map(({ goal }) => (
                    <SavingsGoalRow
                      key={goal.id}
                      goal={goal}
                      currency={preferredCurrency}
                      onSelect={() => setSelectedGoalId(goal.id)}
                      onContribute={() => openContribute(goal.id)}
                      onEdit={() => openEditGoal(goal)}
                      onClose={() => openClose(goal)}
                    />
                  ))}
                </div>
              </div>
            ) : null,
          )}

          <ClosedGoalsSection
            goals={closedGoals}
            allGoals={goals}
            accounts={accounts}
            currency={preferredCurrency}
            onReopen={reopenGoal}
          />

          <FreeSavingsSection
            entries={freeEntries}
            currency={preferredCurrency}
            onContribute={() => openContribute(null)}
          />
        </>
      ) : null}

      <SavingsGoalDetailPanel
        goal={selectedGoal}
        entries={entries}
        currency={preferredCurrency}
        onOpenChange={(open) => {
          if (!open) setSelectedGoalId(null);
        }}
        onEdit={() => selectedGoal && openEditGoal(selectedGoal)}
        onContribute={() => selectedGoal && openContribute(selectedGoal.id)}
        onClose={() => selectedGoal && openClose(selectedGoal)}
      />

      {goalForm ? (
        <SavingsGoalFormPanel
          open
          onOpenChange={(open) => {
            if (!open) setGoalForm(null);
          }}
          mode={goalForm.mode}
          value={goalFormValue}
          onChange={(patch) => setGoalFormValue((v) => ({ ...v, ...patch }))}
          currencyLocked={
            goalForm.mode === "edit" && entries.some((e) => e.savingsGoalId === goalForm.id)
          }
          onSubmit={submitGoalForm}
          submitting={mutations.createGoal.isPending || mutations.updateGoal.isPending}
          dirty={goalForm.mode === "edit"}
        />
      ) : null}

      {entryForm ? (
        <SavingsEntryFormPanel
          open
          onOpenChange={(open) => {
            if (!open) setEntryForm(null);
          }}
          value={entryForm}
          onChange={(patch) => setEntryForm((v) => (v ? { ...v, ...patch } : v))}
          openGoals={openGoals}
          accounts={accounts}
          onSubmit={submitEntryForm}
          submitting={mutations.createEntry.isPending}
        />
      ) : null}

      {closeTarget && closeValue ? (
        <SavingsGoalClosePanel
          open
          onOpenChange={(open) => {
            if (!open) {
              setCloseTarget(null);
              setCloseValue(null);
            }
          }}
          goal={closeTarget}
          complete={isGoalComplete(goalStatus(closeTarget, new Date()))}
          value={closeValue}
          onChange={(patch) => setCloseValue((v) => (v ? { ...v, ...patch } : v))}
          accounts={accounts}
          otherOpenGoals={openGoals.filter((g) => g.id !== closeTarget.id)}
          onSubmit={submitClose}
          submitting={mutations.closeGoal.isPending}
        />
      ) : null}
    </div>
  );
}
