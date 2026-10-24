import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { customFields } from "@finance/contracts";

import { customFieldsApi } from "../api/customFieldsApi";

export const CUSTOM_FIELDS_KEY = ["custom-fields"] as const;

/** The person's custom fields, in their order. */
export function useCustomFields() {
  return useQuery({ queryKey: CUSTOM_FIELDS_KEY, queryFn: customFieldsApi.list });
}

/**
 * Per value, how many movements hold it and their totals. Keyed under
 * `["transactions", …]` so every movement change (which already invalidates that
 * prefix) refreshes it too.
 */
export function useFieldSummary(fieldId: string) {
  return useQuery({
    queryKey: ["transactions", "field-summary", fieldId],
    queryFn: () => customFieldsApi.summary(fieldId),
  });
}

/** Creating, editing and deleting fields. A field change also changes what
 * movements show, so movements are refreshed with it. */
export function useCustomFieldMutations() {
  const qc = useQueryClient();
  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: CUSTOM_FIELDS_KEY });
    void qc.invalidateQueries({ queryKey: ["transactions"] });
  };
  return {
    create: useMutation({
      mutationFn: (body: customFields.CreateCustomField) => customFieldsApi.create(body),
      onSuccess: invalidate,
    }),
    update: useMutation({
      mutationFn: (vars: { id: string; body: customFields.UpdateCustomField }) =>
        customFieldsApi.update(vars.id, vars.body),
      onSuccess: invalidate,
    }),
    remove: useMutation({
      mutationFn: (id: string) => customFieldsApi.remove(id),
      onSuccess: invalidate,
    }),
  };
}

/** Values on movements: one movement, a bulk assignment, and its undo. */
export function useFieldValueMutations() {
  const qc = useQueryClient();
  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["transactions"] });
    void qc.invalidateQueries({ queryKey: CUSTOM_FIELDS_KEY });
  };
  return {
    setValues: useMutation({
      mutationFn: (vars: {
        transactionId: string;
        values: Record<string, customFields.CustomFieldValue | null>;
      }) => customFieldsApi.setValues(vars.transactionId, vars.values),
      onSuccess: invalidate,
    }),
    assign: useMutation({
      mutationFn: (vars: {
        fieldId: string;
        body: customFields.AssignValuesRequest;
        idempotencyKey: string;
      }) => customFieldsApi.assign(vars.fieldId, vars.body, vars.idempotencyKey),
      onSuccess: invalidate,
    }),
    revert: useMutation({
      mutationFn: (vars: { fieldId: string; body: customFields.RevertAssignmentRequest }) =>
        customFieldsApi.revert(vars.fieldId, vars.body),
      onSuccess: invalidate,
    }),
  };
}
