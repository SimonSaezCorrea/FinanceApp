import type { customFields } from "@finance/contracts";

import { apiFetch } from "@finance/client";

/** The person's own fields on their movements (specs/036). */
export const customFieldsApi = {
  list: () => apiFetch<customFields.CustomField[]>("/custom-fields"),

  create: (body: customFields.CreateCustomField) =>
    apiFetch<customFields.CustomField>("/custom-fields", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  update: (id: string, body: customFields.UpdateCustomField) =>
    apiFetch<customFields.CustomField>(`/custom-fields/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),

  remove: (id: string) => apiFetch<void>(`/custom-fields/${id}`, { method: "DELETE" }),

  /** How many existing movements a scope covers ("aplicar a N existentes"). */
  scopeCount: (scope: customFields.CustomFieldScope) =>
    apiFetch<{ count: number }>("/custom-fields/scope-count", {
      method: "POST",
      body: JSON.stringify({ scope }),
    }),

  /** Per value, how many movements hold it and their totals. */
  summary: (fieldId: string) =>
    apiFetch<customFields.FieldSummary>(`/transactions/summary/by-field/${fieldId}`),

  /** One movement's values; `null` takes a value away. */
  setValues: (
    transactionId: string,
    values: Record<string, customFields.CustomFieldValue | null>,
  ) =>
    apiFetch<{ customFields: Record<string, customFields.CustomFieldValue> }>(
      `/transactions/${transactionId}/custom-fields`,
      { method: "PATCH", body: JSON.stringify({ values }) },
    ),

  previewAssignment: (fieldId: string, body: customFields.AssignValuesRequest) =>
    apiFetch<customFields.AssignmentPreview>(`/custom-fields/${fieldId}/assignments/preview`, {
      method: "POST",
      body: JSON.stringify(body),
    }),

  assign: (fieldId: string, body: customFields.AssignValuesRequest, idempotencyKey: string) =>
    apiFetch<customFields.AssignValuesResponse>(`/custom-fields/${fieldId}/assignments`, {
      method: "POST",
      body: JSON.stringify(body),
      idempotencyKey,
    }),

  revert: (fieldId: string, body: customFields.RevertAssignmentRequest) =>
    apiFetch<customFields.RevertAssignmentResponse>(
      `/custom-fields/${fieldId}/assignments/revert`,
      { method: "POST", body: JSON.stringify(body) },
    ),
};
