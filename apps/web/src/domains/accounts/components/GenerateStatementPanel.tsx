import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { accounts as accountsContract, type accounts } from "@finance/contracts";
import { formatMoney } from "@finance/money";

import { ApiRequestError } from "../../../shared/lib/apiClient";
import { FormDateField, FormNotice } from "../../../shared/ui/form";
import { FormSurface } from "../../../shared/ui/overlay";
import { useAccountMutations } from "../hooks/useAccounts";

/** `yyyy-mm-dd` of a LOCAL date — what the date fields exchange. */
function localDay(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** The proposed start: the day after the last close; with no statement yet, the
 * day the open period started (or a month back when nothing is open either). */
function initialStart(statements: accounts.CreditStatement[]): string {
  const next = accountsContract.suggestedPeriodStart(statements);
  if (next) return next;
  const open = statements.find((s) => !s.closedAt);
  if (open) return localDay(new Date(open.periodStart));
  const d = new Date();
  d.setMonth(d.getMonth() - 1);
  return localDay(d);
}

const startOf = (day: string) => new Date(`${day}T00:00:00`).toISOString();
const endOf = (day: string) => new Date(`${day}T23:59:59.999`).toISOString();

/**
 * "Generar facturación" — or, given a `statement`, "Editar fechas" of one already
 * generated. The user copies the three dates printed on the bank's statement:
 * start, close and payment due date. The app no longer derives them from a
 * configured billing cycle (deferred, `docs/PENDING.md`).
 *
 * Generating pre-fills the start with the day after the previous statement's
 * close. The dates go out as instants in the user's own zone: the START of the
 * first day and the END of the close/due days, so a movement recorded on the
 * closing day (at local midnight) falls inside the period.
 *
 * Editing mirrors the server's locks: a settled period only lets its due date
 * change, and only the latest statement can move its close. A day left as it was
 * is sent back as its original instant, so an untouched field never reads as a
 * move (older periods were closed at other times of day).
 */
export function GenerateStatementPanel({
  account,
  statements,
  statement = null,
  open,
  onOpenChange,
}: Readonly<{
  account: accounts.BankAccount;
  statements: accounts.CreditStatement[];
  /** The generated statement whose dates are being edited; null = generate. */
  statement?: accounts.CreditStatement | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}>) {
  const { t, i18n } = useTranslation();
  const { generateStatements, updateStatementDates } = useAccountMutations();
  const editing = statement !== null;
  // The OPEN period: editing only SCHEDULES its dates (it stays open and is generated
  // when the close arrives, or earlier from "Generar facturación"). A closed one is
  // already generated, so its dates move for real.
  const scheduling = editing && statement.closedAt === null;
  const today = localDay(new Date());
  const currentClose = statement?.closedAt ?? statement?.nextClosingDate ?? null;
  // Generating starts from what the open period already has scheduled.
  const scheduled = statements.find((s) => !s.closedAt && s.nextClosingDate && s.dueDate);

  const initial = editing
    ? {
        start: localDay(new Date(statement.periodStart)),
        close: currentClose ? localDay(new Date(currentClose)) : "",
        due: statement.dueDate ? localDay(new Date(statement.dueDate)) : "",
      }
    : {
        start: initialStart(statements),
        close: scheduled?.nextClosingDate ? localDay(new Date(scheduled.nextClosingDate)) : today,
        due: scheduled?.dueDate ? localDay(new Date(scheduled.dueDate)) : "",
      };
  const [start, setStart] = useState(initial.start);
  const [close, setClose] = useState(initial.close);
  const [due, setDue] = useState(initial.due);

  // Generating: after every close. Editing: after the closes BEFORE this one (its
  // siblings in other currencies share its close and don't count).
  const closeTime = editing && !scheduling ? new Date(statement.closedAt!).getTime() : null;
  const earlier =
    closeTime === null
      ? statements
      : statements.filter((s) => s.closedAt && new Date(s.closedAt).getTime() < closeTime);
  const lastClose = accountsContract.suggestedPeriodStart(earlier);

  const group =
    closeTime === null
      ? []
      : statements.filter((s) => s.closedAt && new Date(s.closedAt).getTime() === closeTime);
  const settled = group.some(accountsContract.isSettled);
  const laterClosed =
    closeTime !== null &&
    statements.some((s) => s.closedAt && new Date(s.closedAt).getTime() > closeTime);
  const startLocked = editing && !scheduling && settled;
  const closeLocked = editing && !scheduling && (settled || laterClosed);

  // `yyyy-mm-dd` strings compare in date order.
  const issue = !start
    ? null
    : lastClose && start < lastClose
      ? t("accounts.generate.overlaps", {
          date: new Date(`${lastClose}T00:00:00`).toLocaleDateString(i18n.language),
        })
      : close && close < start
        ? t("accounts.generate.closeBeforeStart")
        : due && due < close
          ? t("accounts.generate.dueBeforeClose")
          : null;
  const dirty = start !== initial.start || close !== initial.close || due !== initial.due;
  const canSubmit = Boolean(start && close && due) && issue === null && (!editing || dirty);
  const windowMoves =
    editing && !scheduling && (start !== initial.start || close !== initial.close);

  // Every open period (one per currency) closes with these same dates.
  const openPeriods = editing ? [] : statements.filter((s) => !s.closedAt);
  const pending = editing ? updateStatementDates.isPending : generateStatements.isPending;

  // A double click (or Enter + click) fires twice before the disabled button is
  // drawn: the second send would collide with the close the first just recorded.
  const sending = useRef(false);
  const settle = () => {
    sending.current = false;
  };

  const onError = (e: Error) =>
    toast.error(
      t(`errors.${e instanceof ApiRequestError ? e.code : "INTERNAL_ERROR"}`, {
        defaultValue: t("errors.INTERNAL_ERROR"),
      }),
    );

  function submit() {
    if (sending.current) return;
    sending.current = true;
    if (editing) {
      updateStatementDates.mutate(
        {
          id: account.id,
          statementId: statement.id,
          body: {
            periodStart: start === initial.start ? statement.periodStart : startOf(start),
            closedAt: close === initial.close && currentClose ? currentClose : endOf(close),
            dueDate: due === initial.due && statement.dueDate ? statement.dueDate : endOf(due),
          },
        },
        {
          onSuccess: () => {
            toast.success(
              t(scheduling ? "accounts.generate.scheduleSuccess" : "accounts.generate.editSuccess"),
            );
            onOpenChange(false);
          },
          onError,
          onSettled: settle,
        },
      );
      return;
    }
    generateStatements.mutate(
      {
        id: account.id,
        body: { periodStart: startOf(start), closedAt: endOf(close), dueDate: endOf(due) },
      },
      {
        onSuccess: () => {
          toast.success(t("accounts.actions.generateStatementsSuccess"));
          onOpenChange(false);
        },
        onError,
        onSettled: settle,
      },
    );
  }

  return (
    <FormSurface
      open={open}
      onOpenChange={onOpenChange}
      mode={editing ? "edit" : "create"}
      surface="panel"
      title={editing ? t("accounts.generate.editTitle") : t("accounts.generate.title")}
      description={
        scheduling ? t("accounts.generate.scheduleDescription") : t("accounts.generate.description")
      }
      submitLabel={editing ? undefined : t("accounts.actions.generateStatements")}
      canSubmit={canSubmit}
      dirty={editing ? dirty : undefined}
      submitting={pending}
      onSubmit={submit}
    >
      <FormDateField
        id="gen-start"
        label={t("accounts.generate.periodStart")}
        value={start}
        onChange={setStart}
        disabled={startLocked}
      />
      <FormDateField
        id="gen-close"
        label={t("accounts.generate.closedAt")}
        value={close}
        onChange={setClose}
        disabled={closeLocked}
      />
      <FormDateField
        id="gen-due"
        label={t("accounts.generate.dueDate")}
        value={due}
        onChange={setDue}
      />
      {issue ? (
        <FormNotice tone="warning" className="mt-3">
          {issue}
        </FormNotice>
      ) : null}
      {editing && (startLocked || closeLocked) ? (
        <FormNotice className="mt-3">
          {settled ? t("accounts.generate.lockedSettled") : t("accounts.generate.lockedLater")}
        </FormNotice>
      ) : null}
      {!editing && lastClose ? (
        <p className="mt-2 text-xs text-muted-foreground">{t("accounts.generate.startHint")}</p>
      ) : null}
      {windowMoves ? (
        <p className="mt-2 text-xs text-muted-foreground">{t("accounts.generate.relinkHint")}</p>
      ) : null}

      {openPeriods.length > 0 ? (
        <div className="mt-4 flex flex-col gap-2 rounded-lg border border-border bg-muted/40 p-3 text-sm">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {t("accounts.generate.accumulated")}
          </span>
          {openPeriods.map((p) => (
            <div key={p.id} className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">
                {openPeriods.length > 1
                  ? t("accounts.actions.generateStatementsPreviewAmountIn", {
                      currency: p.currency,
                    })
                  : t("accounts.actions.generateStatementsPreviewAmount")}
              </span>
              <span className="font-semibold tabular-nums">
                {formatMoney(p.amount, { locale: i18n.language, currency: p.currency })}
              </span>
            </div>
          ))}
          <p className="text-xs text-muted-foreground">{t("accounts.generate.relinkHint")}</p>
        </div>
      ) : null}
    </FormSurface>
  );
}
