import { describe, expect, it } from "vitest";

import { OpenState } from "../../../../../../src/domains/accounts/domain/states/open-state";

describe("OpenState", () => {
  const state = new OpenState();
  it("allows close and pay, rejects correctAmount", () => {
    expect(state.canClose()).toBe(true);
    expect(state.canPay()).toBe(true);
    expect(state.canCorrectAmount()).toBe(false);
  });
});
