import type { accounts } from "@finance/contracts";

/**
 * A new account starts with only its cash account (created with the user). Until there is
 * anything else — a bank account, a credit card, a prepaid account — the first step is pending.
 */
export function needsFirstAccount(list: readonly Pick<accounts.BankAccount, "type">[]): boolean {
  return list.every((account) => account.type === "CASH");
}

/** Query parameter that opens the "new account" form on arrival at Cuentas (from the guide). */
export const NEW_ACCOUNT_PARAM = "nueva";

/** The guided first steps (2026-10-11), in order. */
export const FIRST_STEPS = ["account", "movement", "wallet"] as const;
export type FirstStep = (typeof FIRST_STEPS)[number];
export type FirstStepsDone = Record<FirstStep, boolean>;

/** Which steps are done: a real account, any movement, anything pinned to the wallet. */
export function firstStepsDone(input: {
  accounts: readonly Pick<accounts.BankAccount, "type">[];
  movementCount: number;
  walletCount: number;
}): FirstStepsDone {
  return {
    account: !needsFirstAccount(input.accounts),
    movement: input.movementCount > 0,
    wallet: input.walletCount > 0,
  };
}

/** The step to do next (the first one pending), or null once all are done. */
export function nextFirstStep(done: FirstStepsDone): FirstStep | null {
  return FIRST_STEPS.find((step) => !done[step]) ?? null;
}
