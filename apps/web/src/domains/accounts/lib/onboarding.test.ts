import { describe, expect, it } from "vitest";

import { firstStepsDone, needsFirstAccount, nextFirstStep } from "./onboarding";

describe("needsFirstAccount", () => {
  it("is pending until there is an account other than cash", () => {
    expect(needsFirstAccount([])).toBe(true);
    expect(needsFirstAccount([{ type: "CASH" }])).toBe(true);
    expect(needsFirstAccount([{ type: "CASH" }, { type: "CHECKING" }])).toBe(false);
    expect(needsFirstAccount([{ type: "CREDIT_CARD" }])).toBe(false);
  });
});

describe("first steps", () => {
  it("moves on step by step and ends when all three are done", () => {
    const start = firstStepsDone({
      accounts: [{ type: "CASH" }],
      movementCount: 0,
      walletCount: 0,
    });
    expect(nextFirstStep(start)).toBe("account");

    const withAccount = firstStepsDone({
      accounts: [{ type: "CASH" }, { type: "SIGHT" }],
      movementCount: 0,
      walletCount: 0,
    });
    expect(nextFirstStep(withAccount)).toBe("movement");

    const withMovement = { ...withAccount, movement: true };
    expect(nextFirstStep(withMovement)).toBe("wallet");
    expect(nextFirstStep({ ...withMovement, wallet: true })).toBeNull();
  });
});
