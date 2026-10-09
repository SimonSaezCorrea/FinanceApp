import type { imports } from "@finance/contracts";

import { apiFetch } from "@finance/client";

export const importApi = {
  /** Moves money like any movement does, so it carries the attempt's
   * `Idempotency-Key` (specs/015) — a double click can't import the file twice. */
  transactions: (body: imports.ImportTransactionsRequest, idempotencyKey: string) =>
    apiFetch<imports.ImportResult>("/import/transactions", {
      method: "POST",
      body: JSON.stringify(body),
      idempotencyKey,
    }),
  /** What a Cuadra template would do — writes nothing, so no idempotency key. */
  previewTemplate: (body: imports.TemplateImportRequest) =>
    apiFetch<imports.TemplatePreviewResponse>("/import/template/preview", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  /** Applies a Cuadra template all-or-nothing (specs/027), retry-safe. */
  importTemplate: (body: imports.TemplateImportRequest, idempotencyKey: string) =>
    apiFetch<imports.TemplateImportResult>("/import/template", {
      method: "POST",
      body: JSON.stringify(body),
      idempotencyKey,
    }),
};
