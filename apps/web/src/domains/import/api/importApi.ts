import type { imports } from "@finance/contracts";

import { apiFetch } from "../../../shared/lib/apiClient";

export const importApi = {
  /** Moves money like any movement does, so it carries the attempt's
   * `Idempotency-Key` (specs/015) — a double click can't import the file twice. */
  transactions: (body: imports.ImportTransactionsRequest, idempotencyKey: string) =>
    apiFetch<imports.ImportResult>("/import/transactions", {
      method: "POST",
      body: JSON.stringify(body),
      idempotencyKey,
    }),
};
