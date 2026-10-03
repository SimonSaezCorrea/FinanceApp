import { beforeEach, describe, expect, it, vi } from "vitest";

import type { installments } from "@finance/contracts";

import { apiFetch } from "../../../shared/lib/apiClient";
import { installmentsApi } from "./installmentsApi";

vi.mock("../../../shared/lib/apiClient", () => ({ apiFetch: vi.fn() }));

/**
 * Both money-moving writes are protected by the API (specs/015) and refused with
 * `IDEMPOTENCY_KEY_REQUIRED` when the key is missing — which is exactly how
 * creating a plan broke: the client never sent one.
 */
describe("installmentsApi idempotency", () => {
  beforeEach(() => vi.mocked(apiFetch).mockReset());

  it("creating a plan sends the attempt's Idempotency-Key", async () => {
    await installmentsApi.create({ title: "Notebook" } as installments.CreateInstallmentPlan, "k1");
    expect(apiFetch).toHaveBeenCalledWith(
      "/installments",
      expect.objectContaining({ method: "POST", idempotencyKey: "k1" }),
    );
  });

  it("paying an instalment sends the attempt's Idempotency-Key", async () => {
    await installmentsApi.pay(
      "p1",
      2,
      { fromAccountId: "a1" } as installments.PayInstallment,
      "k2",
    );
    expect(apiFetch).toHaveBeenCalledWith(
      "/installments/p1/payments/2/pay",
      expect.objectContaining({ method: "POST", idempotencyKey: "k2" }),
    );
  });
});
