import { describe, expect, it } from "vitest";

import { WALLET_MAX_ITEMS, reorderWalletSchema } from "./index";

const id = (n: number) => `019a0000-0000-7000-8000-${String(n).padStart(12, "0")}`;

describe("reorderWalletSchema (security run-3)", () => {
  it("accepts up to WALLET_MAX_ITEMS distinct ids", () => {
    const ids = Array.from({ length: WALLET_MAX_ITEMS }, (_, i) => id(i));
    expect(reorderWalletSchema.safeParse({ ids }).success).toBe(true);
  });

  it("refuses more ids than the wallet holds", () => {
    const ids = Array.from({ length: WALLET_MAX_ITEMS + 1 }, (_, i) => id(i));
    expect(reorderWalletSchema.safeParse({ ids }).success).toBe(false);
  });

  it("refuses a repeated id", () => {
    expect(reorderWalletSchema.safeParse({ ids: [id(1), id(1)] }).success).toBe(false);
  });
});
