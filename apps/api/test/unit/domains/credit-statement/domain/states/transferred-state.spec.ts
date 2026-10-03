import { describe, expect, it } from "vitest";

import { TransferredState } from "../../../../../../src/domains/credit-statement/domain/states/transferred-state";

describe("TransferredState", () => {
  const state = new TransferredState();
  it("is terminal: nothing can be closed, paid, prepaid or transferred again", () => {
    expect(state.name).toBe("TRANSFERRED");
    expect(state.canClose()).toBe(false);
    expect(state.canPay()).toBe(false);
    expect(state.canPrepay()).toBe(false);
    expect(state.canTransfer()).toBe(false);
  });
});
