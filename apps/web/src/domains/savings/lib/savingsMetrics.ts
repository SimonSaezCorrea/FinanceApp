import type { savings } from "@finance/contracts";
import { addMoney, toMoney } from "@finance/money";

export type SavingsGoalStatus =
  | { kind: "complete" }
  | { kind: "overdue"; missing: string }
  | { kind: "shortOnPace"; etaLabel: string; etaMonths: number; neededPerMonth: string }
  | { kind: "onTrack"; etaLabel: string; etaMonths: number; deadlineMonths: number | null }
  | { kind: "noContributions" };

/** Percent of target reached, capped at 100 for display (a goal can be
 * over-funded — the bar/label never exceed 100%). */
export function goalPct(saved: string, target: string): number {
  const t = toMoney(target);
  if (t.lessThanOrEqualTo(0)) return 0;
  return Math.min(100, Math.round(toMoney(saved).dividedBy(t).times(100).toNumber()));
}

/** How much is still missing — never negative. */
export function goalLeft(saved: string, target: string): string {
  const left = toMoney(target).minus(toMoney(saved));
  return left.greaterThan(0) ? left.toString() : "0";
}

const MONTHS_ES = [
  "ene",
  "feb",
  "mar",
  "abr",
  "may",
  "jun",
  "jul",
  "ago",
  "sep",
  "oct",
  "nov",
  "dic",
];

/** "{mes} {año}" label for a date `months` in the future from `now`. */
export function monthYearLabel(now: Date, monthsAhead: number): string {
  const total = now.getMonth() + monthsAhead;
  const year = now.getFullYear() + Math.floor(total / 12);
  const month = ((total % 12) + 12) % 12;
  return `${MONTHS_ES[month]} ${year}`;
}

/** Whole calendar months from `now` until `deadline` — negative once past.
 * Not reached that day-of-month yet in the final month rounds down, so a
 * deadline "in 2.9 months" reads as 2, matching how someone would actually
 * count "do I have 3 months or not". */
export function monthsUntil(now: Date, deadline: Date): number {
  let months =
    (deadline.getFullYear() - now.getFullYear()) * 12 + (deadline.getMonth() - now.getMonth());
  if (deadline.getDate() < now.getDate()) months -= 1;
  return months;
}

/** Monthly aporte needed to reach the deadline, rounded UP to the nearest
 * 10.000 — "0" when there's no deadline or it's already past. */
export function neededPerMonth(
  saved: string,
  target: string,
  deadlineMonths: number | null,
): string {
  if (deadlineMonths === null || deadlineMonths <= 0) return "0";
  const perMonth = toMoney(goalLeft(saved, target)).dividedBy(deadlineMonths);
  return perMonth.dividedBy(10000).ceil().times(10000).toString();
}

/**
 * Classifies a goal's state — cumplida > vencida > sin aportes > no llega a
 * tiempo > en ritmo (spec.md's exact priority, `savings-goal-closeable.ts`'s
 * backend twin for cumplida/vencida). `pace`/`saved`/`target`/`deadline` are
 * the primitives the API already derives/stores; everything else (eta,
 * agrupación, needed) is pure presentation logic computed here.
 */
export function goalStatus(
  goal: Pick<savings.SavingsGoal, "savedAmount" | "targetAmount" | "deadline" | "pace">,
  now: Date,
): SavingsGoalStatus {
  const complete = toMoney(goal.savedAmount).greaterThanOrEqualTo(toMoney(goal.targetAmount));
  if (complete) return { kind: "complete" };

  const deadline = goal.deadline ? new Date(goal.deadline) : null;
  const overdue = deadline !== null && deadline.getTime() < now.getTime();
  if (overdue) return { kind: "overdue", missing: goalLeft(goal.savedAmount, goal.targetAmount) };

  const pace = toMoney(goal.pace);
  if (!pace.greaterThan(0)) return { kind: "noContributions" };

  const left = goalLeft(goal.savedAmount, goal.targetAmount);
  const etaMonths = Math.max(1, Math.ceil(toMoney(left).dividedBy(pace).toNumber()));
  const etaLabel = monthYearLabel(now, etaMonths);
  const deadlineMonths = deadline ? monthsUntil(now, deadline) : null;

  if (deadlineMonths !== null && etaMonths > deadlineMonths) {
    return {
      kind: "shortOnPace",
      etaLabel,
      etaMonths,
      neededPerMonth: neededPerMonth(goal.savedAmount, goal.targetAmount, deadlineMonths),
    };
  }
  return { kind: "onTrack", etaLabel, etaMonths, deadlineMonths };
}

export type SavingsGoalGroup = "live" | "late" | "done";

/** "En curso" (incompleta, no vencida) / "Fuera de plazo" (incompleta,
 * vencida) / "Cumplidas" — a closed goal belongs to NONE of these (it has
 * its own separate block). */
export function goalGroup(status: SavingsGoalStatus): SavingsGoalGroup {
  if (status.kind === "complete") return "done";
  if (status.kind === "overdue") return "late";
  return "live";
}

export interface GoalWithStatus {
  goal: savings.SavingsGoal;
  status: SavingsGoalStatus;
  group: SavingsGoalGroup;
}

/** Groups OPEN goals only (closed ones are the caller's own separate list),
 * in the fixed order En curso → Fuera de plazo → Cumplidas; an empty group is
 * simply an empty array — the caller decides not to render it. */
export function groupGoals(goals: savings.SavingsGoal[], now: Date = new Date()) {
  const withStatus: GoalWithStatus[] = goals
    .filter((g) => g.closedAt === null)
    .map((goal) => {
      const status = goalStatus(goal, now);
      return { goal, status, group: goalGroup(status) };
    });
  return {
    live: withStatus.filter((g) => g.group === "live"),
    late: withStatus.filter((g) => g.group === "late"),
    done: withStatus.filter((g) => g.group === "done"),
  };
}

/** A goal can be closed only once it's cumplida or vencida — mirrors the
 * backend's `isSavingsGoalCloseable` exactly (same two conditions), so the UI
 * never offers an action the server would refuse. */
export function isGoalCloseable(status: SavingsGoalStatus): boolean {
  return status.kind === "complete" || status.kind === "overdue";
}

/** Whether the close destination should default to "cumplida" copy/behavior
 * (retirar a cuenta) vs. the "sin cumplir" one (pasar a ahorro libre). */
export function isGoalComplete(status: SavingsGoalStatus): boolean {
  return status.kind === "complete";
}

export function sumAmounts(amounts: string[]): string {
  return amounts.reduce((acc, a) => addMoney(acc, a), "0");
}

/** Σ every aporte (any goal, or free savings) dated in `now`'s calendar
 * month — the total card's "Este mes" stat. Closed goals' aportes are NOT
 * excluded here on purpose: "this month" is about real money moved, and a
 * goal closed later in the same month still moved it. */
export function thisMonthTotal(entries: savings.SavingsEntry[], now: Date = new Date()): string {
  return sumAmounts(
    entries
      .filter((e) => {
        const d = new Date(e.contributedAt);
        return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
      })
      .map((e) => e.amount),
  );
}
