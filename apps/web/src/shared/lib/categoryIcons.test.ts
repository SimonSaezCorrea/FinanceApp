import { PiggyBank, ShoppingCart, Tag } from "lucide-react";
import { describe, expect, it } from "vitest";

import { categoryIcon } from "./categoryIcons";

describe("categoryIcon", () => {
  it("maps a catalogue code to its icon", () => {
    expect(categoryIcon("SUPERMARKET")).toBe(ShoppingCart);
    expect(categoryIcon("SAVINGS")).toBe(PiggyBank);
  });

  it("falls back to the generic tag for no category or an unknown code", () => {
    expect(categoryIcon(null)).toBe(Tag);
    expect(categoryIcon(undefined)).toBe(Tag);
    expect(categoryIcon("NOT_A_CODE")).toBe(Tag);
  });
});
