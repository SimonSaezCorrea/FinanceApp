import { describe, expect, it, vi } from "vitest";

import { EventBus } from "@nestjs/cqrs";

import { CustomField } from "../../../../../src/domains/custom-field/domain/custom-field.aggregate";
import { CreateMovementTemplateHandler } from "../../../../../src/domains/movement-template/application/commands/create-movement-template.handler";
import { CreateMovementTemplateCommand } from "../../../../../src/domains/movement-template/application/commands/movement-template.commands";
import type { TemplateReferencePortsProvider } from "../../../../../src/domains/movement-template/application/reference-ports.provider";
import {
  type TemplateReferencePorts,
  verifyTemplateReferences,
} from "../../../../../src/domains/movement-template/application/template-references";
import { MovementTemplate } from "../../../../../src/domains/movement-template/domain/movement-template.aggregate";
import type { MovementTemplateRepositoryPort } from "../../../../../src/domains/movement-template/domain/ports/movement-template.repository.port";
import { fakeCategoryLookup } from "../../../support/fake-ports";

const ACCOUNT = "019a0000-0000-7000-8000-0000000000c1";
const CARD = "019a0000-0000-7000-8000-0000000000c2";
const SERIES = "019a0000-0000-7000-8000-0000000000c3";
const FIELD = "019a0000-0000-7000-8000-0000000000f1";

function boolField() {
  const plan = CustomField.planCreation(
    "u1",
    {
      name: "Transferido",
      type: "BOOLEAN",
      options: [],
      scope: { movementKinds: [], accountIds: [], cardKinds: [] },
    },
    0,
  );
  return CustomField.fromPersistence({ id: FIELD, ...plan });
}

function ports(over: Partial<Record<keyof TemplateReferencePorts, unknown>> = {}) {
  return {
    accounts: { accountOwned: vi.fn(async () => true) },
    cards: { findOnAccount: vi.fn(async () => ({ id: CARD })) },
    categories: fakeCategoryLookup(),
    recurring: { findOne: vi.fn(async () => ({ id: SERIES })) },
    fields: { listForUser: vi.fn(async () => [boolField()]) },
    ...over,
  } as unknown as TemplateReferencePorts;
}

const full = {
  name: "Bencina",
  type: "EXPENSE" as const,
  bankAccountId: ACCOUNT,
  cardId: CARD,
  recurringExpenseId: SERIES,
  customFields: { [FIELD]: false },
};

describe("verifyTemplateReferences", () => {
  it("passes every owned reference and returns the parsed custom field values", async () => {
    await expect(verifyTemplateReferences(ports(), "u1", full)).resolves.toEqual({
      [FIELD]: false,
    });
  });

  it("answers 404 for a foreign account, card, series or custom field", async () => {
    await expect(
      verifyTemplateReferences(
        ports({ accounts: { accountOwned: vi.fn(async () => false) } }),
        "u1",
        full,
      ),
    ).rejects.toMatchObject({ code: "ACCOUNT_NOT_FOUND", httpStatus: 404 });
    await expect(
      verifyTemplateReferences(
        ports({ cards: { findOnAccount: vi.fn(async () => null) } }),
        "u1",
        full,
      ),
    ).rejects.toMatchObject({ code: "CARD_NOT_FOUND" });
    await expect(
      verifyTemplateReferences(
        ports({ recurring: { findOne: vi.fn(async () => null) } }),
        "u1",
        full,
      ),
    ).rejects.toMatchObject({ code: "RECURRING_NOT_FOUND" });
    await expect(
      verifyTemplateReferences(
        ports({ fields: { listForUser: vi.fn(async () => []) } }),
        "u1",
        full,
      ),
    ).rejects.toMatchObject({ code: "CUSTOM_FIELD_NOT_FOUND" });
  });

  it("refuses a value its custom field doesn't accept and a category of the other type", async () => {
    await expect(
      verifyTemplateReferences(ports(), "u1", { ...full, customFields: { [FIELD]: "maybe" } }),
    ).rejects.toMatchObject({ code: "CUSTOM_FIELD_INVALID_VALUE" });
    const incomeOnly = fakeCategoryLookup({
      findById: vi.fn(async (id: string) => ({
        id,
        code: "SALARY",
        kind: "INCOME" as const,
        isSystem: false,
      })),
    });
    await expect(
      verifyTemplateReferences(ports({ categories: incomeOnly }), "u1", {
        name: "x",
        type: "EXPENSE",
        categoryId: SERIES,
      }),
    ).rejects.toMatchObject({ code: "CATEGORY_NOT_ALLOWED" });
  });
});

describe("CreateMovementTemplateHandler", () => {
  function handler(count: number) {
    const repo = {
      countForUser: vi.fn(async () => count),
      create: vi.fn(async (plan) => MovementTemplate.fromPersistence({ id: "t1", ...plan })),
    } as unknown as MovementTemplateRepositoryPort;
    const eventBus = { publishAll: vi.fn() } as unknown as EventBus;
    return {
      repo,
      h: new CreateMovementTemplateHandler(
        eventBus,
        repo,
        ports() as unknown as TemplateReferencePortsProvider,
      ),
    };
  }

  it("creates below the limit", async () => {
    const { h, repo } = handler(49);
    const out = await h.execute(new CreateMovementTemplateCommand("u1", full));
    expect(out.name).toBe("Bencina");
    expect(out.customFields).toEqual({ [FIELD]: false });
    expect(repo.create).toHaveBeenCalledOnce();
  });

  it("refuses the 51st template", async () => {
    const { h, repo } = handler(50);
    await expect(h.execute(new CreateMovementTemplateCommand("u1", full))).rejects.toMatchObject({
      code: "MOVEMENT_TEMPLATE_LIMIT_REACHED",
      httpStatus: 409,
    });
    expect(repo.create).not.toHaveBeenCalled();
  });
});
