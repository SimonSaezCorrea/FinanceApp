import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useSearchParams } from "react-router";
import { toast } from "sonner";

import { customFields } from "@finance/contracts";

import { ApiRequestError } from "@finance/client";
import { Button } from "@finance/ui/src/shared/ui/button";
import { ConfirmModal } from "@finance/ui/src/shared/ui/overlay";
import { useAccounts } from "../../accounts/hooks/useAccounts";
import { cn } from "@finance/ui/src/shared/lib/cn";
import {
  CUSTOM_FIELDS_PANES_MIN_WIDTH,
  useElementWidth,
} from "../../../shared/lib/useElementWidth";
import { PageHeader } from "../../../shared/ui/page-header";
import { ErrorState } from "../../../shared/ui/states";
import { CustomFieldsEmpty } from "../components/CustomFieldsEmpty";
import { exampleForm } from "../lib/examples";
import { CustomFieldsSkeleton } from "../components/CustomFieldsSkeleton";
import { CustomFieldDetail } from "../components/CustomFieldDetail";
import {
  CustomFieldFormPanel,
  emptyCustomFieldForm,
  formFromField,
  type CustomFieldFormValue,
} from "../components/CustomFieldFormPanel";
import { sendable } from "../lib/fieldValues";
import { useCustomFieldMutations, useCustomFields } from "../hooks/useCustomFields";

function errorMessage(error: unknown, t: (key: string) => string): string {
  return error instanceof ApiRequestError ? t(`errors.${error.code}`) : t("errors.INTERNAL_ERROR");
}

/** Where the open column lives in the URL, so a link or a reload opens the same one. */
const OPEN_PARAM = "columna";

/**
 * "Columnas propias" (specs/036): the person's own fields on their movements, as a list beside
 * the open one's detail (its values, per currency, linked to Movimientos already filtered) — or,
 * narrower than `CUSTOM_FIELDS_PANES_MIN_WIDTH` of its own width, the list alone with each column
 * opening as its own screen. Plus the panel to create, edit or delete them.
 */
export function CustomFieldsRoute() {
  const { t } = useTranslation();
  const { data, isLoading, isError, error, refetch } = useCustomFields();
  const { data: accounts } = useAccounts({ status: "active" });
  // Every account, inactive too: a column's scope may name one, and its detail says which.
  const { data: allAccounts } = useAccounts();
  const [measure, width] = useElementWidth();
  const panes = width !== null && width >= CUSTOM_FIELDS_PANES_MIN_WIDTH;
  const [searchParams] = useSearchParams();
  const requestedId = searchParams.get(OPEN_PARAM);
  const { create, update, remove } = useCustomFieldMutations();
  const fields = isError ? [] : (data ?? []);

  const [editing, setEditing] = useState<customFields.CustomField | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<CustomFieldFormValue>(emptyCustomFieldForm);
  const [baseline, setBaseline] = useState<CustomFieldFormValue>(emptyCustomFieldForm);
  const [deleting, setDeleting] = useState<customFields.CustomField | null>(null);

  // The open column: the one in the URL, else (two panes) the first. In one column, none
  // means the list is the screen.
  const requested = fields.find((f) => f.id === requestedId);
  const open = requested ?? (panes ? fields[0] : undefined);
  const detailRef = useRef<HTMLDivElement | null>(null);
  const lastOpenId = useRef(open?.id);
  useEffect(() => {
    if (lastOpenId.current === open?.id) return;
    lastOpenId.current = open?.id;
    if (!requestedId) return;
    detailRef.current?.querySelector<HTMLElement>("h2")?.focus({ preventScroll: true });
    if (!panes) window.scrollTo?.({ top: 0 });
  }, [open?.id, requestedId, panes]);

  // A new column, blank or filled with one of the empty state's examples.
  const openCreate = (start: CustomFieldFormValue = emptyCustomFieldForm()) => {
    setEditing(null);
    setForm(start);
    setBaseline(start);
    setFormOpen(true);
  };
  const openEdit = (field: customFields.CustomField) => {
    const value = formFromField(field);
    setEditing(field);
    setForm(value);
    setBaseline(value);
    setFormOpen(true);
  };

  const submit = () => {
    const defaultField = { type: form.type } as customFields.CustomField;
    const body = {
      name: form.name.trim(),
      type: form.type,
      options:
        form.type === "OPTION" ? form.options.map((o) => ({ ...o, label: o.label.trim() })) : [],
      scope: form.scope,
      defaultValue: sendable(defaultField, form.defaultValue),
      showAsColumn: form.showAsColumn,
    };
    const done = (message: string) => () => {
      toast.success(message);
      setFormOpen(false);
    };
    const onError = (err: unknown) => toast.error(errorMessage(err, t));
    if (editing) {
      const { type, ...rest } = body;
      update.mutate(
        { id: editing.id, body: editing.valueCount > 0 ? rest : { ...rest, type } },
        { onSuccess: done(t("customFields.toast.updated")), onError },
      );
    } else {
      create.mutate(
        { ...body, applyDefaultToExisting: form.applyDefaultToExisting },
        { onSuccess: done(t("customFields.toast.created")), onError },
      );
    }
  };

  const confirmDelete = () => {
    if (!deleting) return;
    remove.mutate(deleting.id, {
      onSuccess: () => {
        toast.success(t("customFields.toast.deleted"));
        setDeleting(null);
      },
      onError: (err: unknown) => toast.error(errorMessage(err, t)),
    });
  };

  // One column with a column open: the detail is its own screen, with the way back on top
  // instead of the page header and its "Nueva columna".
  const detailScreen = !panes && open !== undefined;

  return (
    <div ref={measure} className="flex flex-col gap-6">
      {detailScreen ? null : (
        <PageHeader
          title={t("customFields.title")}
          description={t("customFields.subtitle")}
          actions={
            <Button variant="accent" onClick={() => openCreate()}>
              <Plus className="h-4 w-4" aria-hidden />
              {t("customFields.new")}
            </Button>
          }
        />
      )}

      {isLoading ? <CustomFieldsSkeleton panes={panes} /> : null}
      {!isLoading && isError ? <ErrorState error={error} onRetry={() => refetch()} /> : null}
      {!isLoading && !isError && fields.length === 0 ? (
        <CustomFieldsEmpty
          onExample={(key) => openCreate(exampleForm(key, t))}
          onCreate={() => openCreate()}
        />
      ) : null}
      <div className={cn("flex gap-6", !panes && "flex-col")}>
        {fields.length > 0 && (panes || !open) ? (
          <nav
            aria-label={t("customFields.listLabel")}
            className={cn("flex flex-col", panes ? "w-72 shrink-0 gap-1" : "gap-2")}
          >
            {fields.map((field) => {
              const active = panes && field.id === open?.id;
              return (
                <Link
                  key={field.id}
                  to={`?${OPEN_PARAM}=${field.id}`}
                  replace={panes}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex min-h-14 items-center gap-3 rounded-xl px-4 py-3 hover:bg-surface2",
                    !panes && "border border-border bg-card",
                    active && "bg-surface2 shadow-[inset_3px_0_0_hsl(var(--primary))]",
                  )}
                >
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="truncate font-semibold">{field.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {t(`customFields.type.${field.type}`)} ·{" "}
                      {t("customFields.count", { count: field.valueCount })}
                    </span>
                  </span>
                  {panes ? null : (
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                  )}
                </Link>
              );
            })}
            <p className={cn("pt-2 text-xs text-dim", panes && "px-4")}>
              {t("customFields.limit", {
                count: fields.length,
                max: customFields.CUSTOM_FIELD_MAX_FIELDS,
              })}
            </p>
          </nav>
        ) : null}
        {open ? (
          <div ref={detailRef} className="flex min-w-0 flex-1 flex-col gap-3">
            {panes ? null : (
              <Link
                to="?"
                className="flex min-h-11 items-center gap-1 self-start text-sm text-primary hover:underline"
              >
                <ChevronLeft className="h-4 w-4" aria-hidden />
                {t("customFields.back")}
              </Link>
            )}
            <CustomFieldDetail
              field={open}
              accounts={allAccounts ?? []}
              onEdit={() => openEdit(open)}
              onDelete={() => setDeleting(open)}
              asScreen={!panes}
            />
          </div>
        ) : null}
      </div>

      <CustomFieldFormPanel
        open={formOpen}
        onOpenChange={setFormOpen}
        field={editing ?? undefined}
        value={form}
        onChange={(patch) => setForm((f) => ({ ...f, ...patch }))}
        accounts={accounts ?? []}
        onSubmit={submit}
        submitting={create.isPending || update.isPending}
        dirty={JSON.stringify(form) !== JSON.stringify(baseline)}
      />

      <ConfirmModal
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        onConfirm={confirmDelete}
        title={t("customFields.delete.title", { name: deleting?.name ?? "" })}
        description={
          deleting && deleting.valueCount > 0
            ? t("customFields.delete.description", { count: deleting.valueCount })
            : t("customFields.delete.descriptionNone")
        }
        confirmLabel={t("customFields.delete.confirm")}
        loading={remove.isPending}
      />
    </div>
  );
}
