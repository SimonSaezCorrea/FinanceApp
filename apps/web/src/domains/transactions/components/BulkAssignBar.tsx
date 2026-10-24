import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { customFields as rules, type customFields, type transactions } from "@finance/contracts";

import { ApiRequestError } from "@finance/client";
import { Button } from "@finance/ui/src/shared/ui/button";
import { ConfirmModal } from "@finance/ui/src/shared/ui/overlay";
import { useIdempotencyKey } from "../../../shared/hooks/useIdempotencyKey";
import { customFieldsApi } from "../../custom-fields/api/customFieldsApi";
import { useFieldValueMutations } from "../../custom-fields/hooks/useCustomFields";
import { sendable } from "../../custom-fields/lib/fieldValues";
import { PillSelect } from "./TransactionFiltersBar";

type Value = customFields.CustomFieldValue;

interface Props {
  fields: readonly customFields.CustomField[];
  /** Movements picked one by one. Ignored while `allFiltered`. */
  selectedIds: readonly string[];
  /** "Seleccionar todos los del filtro": the action covers every movement the
   * current filter shows, loaded or not. */
  allFiltered: boolean;
  /** The current Movimientos filter — what `allFiltered` means. */
  filter: Omit<transactions.TransactionFilters, "limit" | "cursor">;
  /** The filter's movement count (its summary). */
  filteredTotal: number;
  onSelectAllFiltered: () => void;
  onDone: () => void;
  onCancel: () => void;
  /** Extra actions for the current selection ("Transferir pendientes"). */
  extra?: React.ReactNode;
}

const errorText = (err: unknown, t: (k: string) => string) =>
  err instanceof ApiRequestError ? t(`errors.${err.code}`) : t("errors.INTERNAL_ERROR");

/**
 * The selection mode's action bar (specs/036, US4): pick a field and a value and
 * give it to every selected movement — or to every movement of the filter. More
 * than 20 asks first, saying how many hold another value (FR-016a); afterwards a
 * notice offers "Deshacer" for ~10 s (FR-016b).
 */
export function BulkAssignBar({
  fields,
  selectedIds,
  allFiltered,
  filter,
  filteredTotal,
  onSelectAllFiltered,
  onDone,
  onCancel,
  extra,
}: Readonly<Props>) {
  const { t } = useTranslation();
  const { assign, revert } = useFieldValueMutations();
  const idempotencyKey = useIdempotencyKey();
  const [fieldId, setFieldId] = useState(fields[0]?.id ?? "");
  const [raw, setRaw] = useState("");
  const [confirm, setConfirm] = useState<customFields.AssignmentPreview | null>(null);
  const field = fields.find((f) => f.id === fieldId);
  const count = allFiltered ? filteredTotal : selectedIds.length;

  if (fields.length === 0) {
    return (
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card p-3 text-sm">
        <span className="text-muted-foreground">{t("customFields.bulk.noFields")}</span>
        <Button variant="ghost" size="sm" onClick={onCancel} className="ml-auto">
          {t("customFields.bulk.cancel")}
        </Button>
      </div>
    );
  }

  const value = (): Value | null => {
    if (!field || raw === "") return null;
    if (field.type === "BOOLEAN") return raw === "true";
    return sendable(field, raw);
  };
  const body = (): customFields.AssignValuesRequest => ({
    target: allFiltered ? { filter } : { ids: [...selectedIds] },
    value: value(),
  });

  const run = () => {
    if (!field) return;
    const request = body();
    assign.mutate(
      { fieldId: field.id, body: request, idempotencyKey: idempotencyKey.current() },
      {
        onSuccess: (result) => {
          idempotencyKey.reset();
          setConfirm(null);
          onDone();
          if (result.skipped > 0)
            toast.info(t("customFields.bulk.skipped", { count: result.skipped }));
          if (result.changed === 0) {
            toast.info(t("customFields.bulk.nothingChanged"));
            return;
          }
          toast.success(t("customFields.bulk.done", { count: result.changed }), {
            duration: 10_000,
            action: {
              label: t("customFields.bulk.undo"),
              onClick: () =>
                revert.mutate(
                  {
                    fieldId: field.id,
                    body: { appliedValue: request.value, restore: result.previous },
                  },
                  {
                    onSuccess: () => toast.success(t("customFields.bulk.undone")),
                    onError: (err) => toast.error(errorText(err, t)),
                  },
                ),
            },
          });
        },
        onError: (err) => toast.error(errorText(err, t)),
      },
    );
  };

  const apply = async () => {
    if (!field) return;
    if (count <= rules.CUSTOM_FIELD_BULK_CONFIRM_THRESHOLD) return run();
    try {
      setConfirm(await customFieldsApi.previewAssignment(field.id, body()));
    } catch (err) {
      toast.error(errorText(err, t));
    }
  };

  return (
    <div
      role="region"
      aria-label={t("customFields.bulk.selected", { count })}
      className="flex flex-wrap items-center gap-2 rounded-xl border border-primary/40 bg-card p-3"
    >
      <span className="text-sm font-medium">
        {allFiltered
          ? t("customFields.bulk.allFilteredOn", { count: filteredTotal })
          : t("customFields.bulk.selected", { count })}
      </span>
      {!allFiltered && filteredTotal > selectedIds.length ? (
        <Button variant="ghost" size="sm" onClick={onSelectAllFiltered}>
          {t("customFields.bulk.allFiltered", { count: filteredTotal })}
        </Button>
      ) : null}

      <PillSelect
        value={fieldId}
        onChange={(id) => {
          setFieldId(id);
          setRaw("");
        }}
        label={t("customFields.bulk.field")}
      >
        {fields.map((f) => (
          <option key={f.id} value={f.id}>
            {f.name}
          </option>
        ))}
      </PillSelect>

      {field && (field.type === "BOOLEAN" || field.type === "OPTION") ? (
        <PillSelect value={raw} onChange={setRaw} label={t("customFields.bulk.value")}>
          <option value="">{t("customFields.values.empty")}</option>
          {field.type === "BOOLEAN" ? (
            <>
              <option value="true">{t("customFields.values.yes")}</option>
              <option value="false">{t("customFields.values.no")}</option>
            </>
          ) : (
            field.options.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))
          )}
        </PillSelect>
      ) : (
        <input
          className="h-9 w-36 rounded-md border bg-card px-3 text-base sm:text-sm"
          type={field?.type === "DATE" ? "date" : "text"}
          inputMode={field?.type === "NUMBER" ? "decimal" : undefined}
          value={raw}
          onChange={(e) =>
            setRaw(field?.type === "NUMBER" ? e.target.value.replace(",", ".") : e.target.value)
          }
          placeholder={t("customFields.values.empty")}
          aria-label={t("customFields.bulk.value")}
        />
      )}

      <Button size="sm" onClick={() => void apply()} disabled={count === 0 || assign.isPending}>
        {t("customFields.bulk.apply")}
      </Button>
      {extra}
      <Button variant="ghost" size="sm" onClick={onCancel} className="ml-auto">
        {t("customFields.bulk.cancel")}
      </Button>

      <ConfirmModal
        open={confirm !== null}
        onOpenChange={(open) => !open && setConfirm(null)}
        onConfirm={run}
        destructive={false}
        loading={assign.isPending}
        title={t("customFields.bulk.confirmTitle", { count: confirm?.inScope ?? 0 })}
        description={[
          confirm && confirm.withOtherValue > 0
            ? t("customFields.bulk.confirmOther", { count: confirm.withOtherValue })
            : "",
          confirm && confirm.outOfScope > 0
            ? t("customFields.bulk.confirmSkipped", { count: confirm.outOfScope })
            : "",
        ]
          .filter(Boolean)
          .join(" ")}
        confirmLabel={t("customFields.bulk.apply")}
      />
    </div>
  );
}
