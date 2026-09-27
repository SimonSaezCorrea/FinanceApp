import { useMutation, useQueryClient } from "@tanstack/react-query";

import type { imports } from "@finance/contracts";

import { importApi } from "../api/importApi";

/** Everything a template can create or move — refreshed after an import. */
const AFFECTED = ["accounts", "transactions", "debts", "installments", "recurring", "savings"];

/** Previewing (a read, despite the POST) and importing a Cuadra template. */
export function useTemplateImport() {
  const queryClient = useQueryClient();
  const preview = useMutation({
    mutationFn: (body: imports.TemplateImportRequest) => importApi.previewTemplate(body),
  });
  const commit = useMutation({
    mutationFn: (vars: { body: imports.TemplateImportRequest; idempotencyKey: string }) =>
      importApi.importTemplate(vars.body, vars.idempotencyKey),
    onSuccess: () => {
      for (const key of AFFECTED) void queryClient.invalidateQueries({ queryKey: [key] });
    },
  });
  return { preview, commit };
}
