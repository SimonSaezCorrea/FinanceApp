import { describe, expect, it } from "vitest";

import { MovementTemplate } from "../../../../../src/domains/movement-template/domain/movement-template.aggregate";
import { MovementTemplateInvalidError } from "../../../../../src/domains/movement-template/domain/errors";

const ACCOUNT = "019a0000-0000-7000-8000-0000000000c1";
const CARD = "019a0000-0000-7000-8000-0000000000c2";
const FIELD = "019a0000-0000-7000-8000-0000000000f1";
const GONE = "019a0000-0000-7000-8000-0000000000f2";

function template(values: Record<string, boolean | string> = {}) {
  const plan = MovementTemplate.planCreation(
    "u1",
    {
      name: "  Arriendo   Mensual ",
      type: "EXPENSE",
      amount: "450000",
      currency: "clp",
      bankAccountId: ACCOUNT,
      description: "  ",
    },
    values,
  );
  return MovementTemplate.fromPersistence({ id: "t1", ...plan });
}

describe("MovementTemplate.planCreation", () => {
  it("trims the name, keys it, upper-cases the currency and drops blank texts", () => {
    const t = template().toContract(new Set());
    expect(t.name).toBe("Arriendo   Mensual");
    expect(template().nameKey).toBe("arriendo mensual");
    expect(t.currency).toBe("CLP");
    expect(t.description).toBeNull();
    expect(t.cardId).toBeNull();
    expect(t.financeCharge).toBe(false);
  });

  it("enforces card ⇒ account, finance charge ⇒ expense without card, amount ⇒ currency", () => {
    expect(() =>
      MovementTemplate.planCreation("u1", { name: "x", type: "EXPENSE", cardId: CARD }, {}),
    ).toThrow(MovementTemplateInvalidError);
    expect(() =>
      MovementTemplate.planCreation("u1", { name: "x", type: "INCOME", financeCharge: true }, {}),
    ).toThrow(MovementTemplateInvalidError);
    expect(() =>
      MovementTemplate.planCreation(
        "u1",
        { name: "x", type: "EXPENSE", financeCharge: true, bankAccountId: ACCOUNT, cardId: CARD },
        {},
      ),
    ).toThrow(MovementTemplateInvalidError);
    expect(() =>
      MovementTemplate.planCreation("u1", { name: "x", type: "EXPENSE", amount: "10" }, {}),
    ).toThrow(MovementTemplateInvalidError);
  });
});

describe("MovementTemplate.replace / toContract", () => {
  it("replaces the whole state, keeping identity", () => {
    const t = template();
    t.replace({ name: "Bencina", type: "EXPENSE" }, {});
    const c = t.toContract(new Set());
    expect(c.id).toBe("t1");
    expect(c.name).toBe("Bencina");
    expect(c.amount).toBeNull();
    expect(c.bankAccountId).toBeNull();
  });

  it("drops values of custom fields that no longer exist", () => {
    const c = template({ [FIELD]: false, [GONE]: "x" }).toContract(new Set([FIELD]));
    expect(c.customFields).toEqual({ [FIELD]: false });
  });
});
