import { NotFoundException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";

import { RecurringService, nextDue } from "./recurring.service";
import type { RecurringRepository } from "./recurring.repository";

const row = {
  id: "r1",
  userId: "u1",
  label: "Arriendo",
  amount: { toString: () => "520000" },
  currency: "CLP",
  category: "Vivienda",
  frequency: "MONTHLY" as const,
  interval: 1,
  anchorDate: new Date("2026-01-05T00:00:00Z"),
  bankAccountId: null,
  active: true,
  notes: null,
  createdAt: new Date("2026-01-01T00:00:00Z"),
  updatedAt: new Date("2026-01-02T00:00:00Z"),
};

function makeService(repo: Partial<RecurringRepository>) {
  return new RecurringService(repo as RecurringRepository);
}

describe("nextDue", () => {
  it("returns the anchor when it is still in the future", () => {
    const d = nextDue(new Date("2026-07-01T00:00:00Z"), "MONTHLY", 1, new Date("2026-06-21T00:00:00Z"));
    expect(d.toISOString()).toBe("2026-07-01T00:00:00.000Z");
  });

  it("steps a monthly anchor forward to the next occurrence on/after today", () => {
    const d = nextDue(new Date("2026-01-05T00:00:00Z"), "MONTHLY", 1, new Date("2026-06-21T00:00:00Z"));
    expect(d.toISOString()).toBe("2026-07-05T00:00:00.000Z");
  });

  it("handles weekly intervals", () => {
    const d = nextDue(new Date("2026-06-01T00:00:00Z"), "WEEKLY", 2, new Date("2026-06-21T00:00:00Z"));
    // +2w = Jun 15 (< 21), +2w = Jun 29
    expect(d.toISOString()).toBe("2026-06-29T00:00:00.000Z");
  });

  it("handles yearly", () => {
    const d = nextDue(new Date("2024-03-10T00:00:00Z"), "YEARLY", 1, new Date("2026-06-21T00:00:00Z"));
    expect(d.toISOString()).toBe("2027-03-10T00:00:00.000Z");
  });
});

describe("RecurringService", () => {
  it("maps a row to the contract incl. computed nextDueAt", async () => {
    const svc = makeService({ list: vi.fn().mockResolvedValue([row]) });
    const [rec] = await svc.list("u1");
    expect(rec).toMatchObject({
      id: "r1",
      label: "Arriendo",
      amount: "520000.0000",
      currency: "CLP",
      frequency: "MONTHLY",
      interval: 1,
      active: true,
    });
    expect(typeof rec.nextDueAt).toBe("string");
  });

  it("defaults nothing but passes active through on create", async () => {
    const create = vi.fn().mockResolvedValue(row);
    const svc = makeService({ create });
    await svc.create("u1", {
      label: "Arriendo",
      amount: "520000",
      currency: "CLP",
      frequency: "MONTHLY",
      interval: 1,
      anchorDate: "2026-01-05T00:00:00.000Z",
    });
    expect(create.mock.calls[0]![1]).toMatchObject({ label: "Arriendo", frequency: "MONTHLY" });
  });

  it("throws NotFound when getting a missing recurring expense", async () => {
    const svc = makeService({ findOne: vi.fn().mockResolvedValue(null) });
    await expect(svc.get("u1", "nope")).rejects.toBeInstanceOf(NotFoundException);
  });

  it("throws NotFound when removing a missing recurring expense", async () => {
    const svc = makeService({ remove: vi.fn().mockResolvedValue(false) });
    await expect(svc.remove("u1", "nope")).rejects.toBeInstanceOf(NotFoundException);
  });
});
