import { describe, expect, it } from "vitest";

import { PaidState } from "../../../../../../src/domains/credit-statement/domain/states/paid-state";

describe("PaidState", () => {
  const state = new PaidState();
  it("rejects close, rejects pay, allows correctAmount", () => {
    expect(state.canClose()).toBe(false);
    expect(state.canPay()).toBe(false);
    expect(state.canCorrectAmount()).toBe(true);
  });
});
