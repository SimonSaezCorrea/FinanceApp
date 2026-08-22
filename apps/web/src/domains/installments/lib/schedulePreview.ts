import type { installments } from "@finance/contracts";
import { equalPrincipalSchedule, subtractMoney, sumMoney, toMoney } from "@finance/money";

export interface SchedulePreviewInput {
  totalPrincipal: string;
  installmentCount: number;
  startDate: string;
  frequency: installments.InstallmentFrequency;
  frequencyInterval: number;
  /** Interest per period, as the plan declares it. */
  aprPerPeriod?: string;
}

export interface SchedulePreview {
  /** What every instalment but the last costs. */
  installmentAmount: string;
  /** The last one, which absorbs the rounding remainder — same figure the server
   *  will store, not an approximation of it. */
  lastInstallmentAmount: string;
  /** True when the two above differ and the difference must be explained (FR-041). */
  hasRoundingAdjustment: boolean;
  firstDueDate: Date;
  lastDueDate: Date;
  /** Σ of the schedule: principal + interest. */
  total: string;
  /** Total − principal. Zero without interest; charged to the card's account as a
   *  finance charge when the plan names one (FR-045). */
  financeCharge: string;
}

/**
 * The create form's live preview.
 *
 * A THIN wrapper over `equalPrincipalSchedule` — the same function the aggregate
 * calls — and over the same date stepping. Re-deriving the formula here is the one
 * thing that would make FR-042 impossible to keep: two implementations of
 * "500.000 in 7" drift on the last cent, and the user would see one figure before
 * saving and another after.
 *
 * Returns `null` for input that cannot describe a schedule (FR-043): the form says
 * so, instead of showing a provisional number that will change.
 */
export function schedulePreview(input: SchedulePreviewInput): SchedulePreview | null {
  const principal = input.totalPrincipal.trim();
  if (principal === "" || !Number.isInteger(input.installmentCount)) return null;
  if (input.installmentCount < 1 || input.frequencyInterval < 1) return null;
  const start = new Date(input.startDate);
  if (Number.isNaN(start.getTime())) return null;

  let rows;
  try {
    rows = equalPrincipalSchedule({
      totalPrincipal: principal,
      installmentCount: input.installmentCount,
      aprPerPeriod: input.aprPerPeriod?.trim() || undefined,
    });
  } catch {
    // A non-positive total or a non-integer count: not an error to report, just
    // not enough to preview yet.
    return null;
  }

  const first = rows[0]!;
  const last = rows[rows.length - 1]!;
  const total = sumMoney(rows.map((r) => r.payment));

  return {
    installmentAmount: first.payment,
    lastInstallmentAmount: last.payment,
    hasRoundingAdjustment: !toMoney(first.payment).equals(toMoney(last.payment)),
    firstDueDate: start,
    lastDueDate: addPeriod(start, rows.length - 1, input.frequency, input.frequencyInterval),
    total,
    financeCharge: subtractMoney(total, principal),
  };
}

/**
 * Due-date stepping, mirroring `InstallmentPlan.planCreation`'s own `addPeriod`.
 *
 * Duplicated on purpose and nowhere else: it is four `Date` calls that belong to no
 * shared package today, and the alternative — sending the form to the server on every
 * keystroke to be told the dates — is worse than these twelve lines.
 */
function addPeriod(
  date: Date,
  n: number,
  frequency: installments.InstallmentFrequency,
  interval: number,
): Date {
  const d = new Date(date);
  const step = n * interval;
  switch (frequency) {
    case "DAILY":
      d.setDate(d.getDate() + step);
      break;
    case "WEEKLY":
      d.setDate(d.getDate() + step * 7);
      break;
    case "YEARLY":
      d.setFullYear(d.getFullYear() + step);
      break;
    default:
      d.setMonth(d.getMonth() + step);
  }
  return d;
}
