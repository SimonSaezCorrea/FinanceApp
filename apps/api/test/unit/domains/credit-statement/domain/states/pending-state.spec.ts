import { describe, expect, it } from "vitest";

import { PendingState } from "../../../../../../src/domains/credit-statement/domain/states/pending-state";

describe("PendingState", () => {
  const state = new PendingState();
  it("rejects close, allows pay, rejects correctAmount", () => {
    expect(state.canClose()).toBe(false);
    expect(state.canPay()).toBe(true);
  });
});
