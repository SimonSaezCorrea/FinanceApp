import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { CategoryCodeIcon } from "./category-icon";

/** Mapping to an icon isn't enough: it has to actually RENDER an svg. A name
 *  that doesn't exist in the installed lucide version resolves to `undefined`
 *  and silently draws nothing. Every code of the seeded catalogue is listed. */
describe("CategoryCodeIcon renders", () => {
  const codes = [
    null,
    "SUPERMARKET",
    "RESTAURANTS",
    "TRANSPORT",
    "HOUSING",
    "UTILITIES",
    "HOME",
    "HEALTH",
    "EDUCATION",
    "SHOPPING",
    "ENTERTAINMENT",
    "SUBSCRIPTIONS",
    "TECHNOLOGY",
    "TRAVEL",
    "SPORTS",
    "PETS",
    "INSURANCE",
    "FAMILY",
    "FEES",
    "SALARY",
    "FREELANCE",
    "REFUND",
    "GIFTS",
    "OTHER",
    "SAVINGS",
    "DEBTS",
    "INTEREST",
    "STATEMENT_PAYMENT",
    "CARD_PREPAYMENT",
    "UNKNOWN_CODE",
  ];

  it.each(codes)("draws an icon for %s", (code) => {
    const { container } = render(<CategoryCodeIcon code={code} className="h-4 w-4" />);
    expect(container.querySelector("svg"), String(code)).not.toBeNull();
  });
});
