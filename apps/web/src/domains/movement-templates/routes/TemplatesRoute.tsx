import { Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { movementTemplates } from "@finance/contracts";
import { formatMoney } from "@finance/money";

import { ApiRequestError } from "@finance/client";
import { Button } from "@finance/ui/src/shared/ui/button";
import { ConfirmModal } from "@finance/ui/src/shared/ui/overlay";
import { useAccounts } from "../../accounts/hooks/useAccounts";
import { useCategoryCatalog } from "../../reference/hooks/useCategoryCatalog";
import { CategoryIcon } from "../../reference/components/CategoryIcon";
import { PageHeader } from "../../../shared/ui/page-header";
import { Skeleton } from "../../../shared/ui/skeleton";
import { ErrorState } from "../../../shared/ui/states";
import { TemplateFormModal } from "../components/TemplateFormModal";
import { useMovementTemplateMutations, useMovementTemplates } from "../hooks/useMovementTemplates";

/**
 * "Plantillas" (specs/037): the person's reusable movements — list, create, edit and
 * delete. Using one happens in the new-movement form ("Usar plantilla").
 */
export function TemplatesRoute() {
  const { t, i18n } = useTranslation();
  const { data, isLoading, isError, error, refetch } = useMovementTemplates();
  const { data: accounts } = useAccounts();
  const { nameOf } = useCategoryCatalog();
  const { remove } = useMovementTemplateMutations();
  const templates = isError ? [] : (data ?? []);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<movementTemplates.MovementTemplate | undefined>();
  const [deleting, setDeleting] = useState<movementTemplates.MovementTemplate | null>(null);
  const full = templates.length >= movementTemplates.MOVEMENT_TEMPLATE_MAX;

  const openCreate = () => {
    setEditing(undefined);
    setFormOpen(true);
  };
  const openEdit = (template: movementTemplates.MovementTemplate) => {
    setEditing(template);
    setFormOpen(true);
  };

  const confirmDelete = () => {
    if (!deleting) return;
    remove.mutate(deleting.id, {
      onSuccess: () => {
        toast.success(t("templates.toast.deleted"));
        setDeleting(null);
      },
      onError: (err: unknown) => {
        const code = err instanceof ApiRequestError ? err.code : "INTERNAL_ERROR";
        toast.error(t(`errors.${code}`, { defaultValue: t("errors.INTERNAL_ERROR") }));
      },
    });
  };

  const accountName = (id: string | null) => accounts?.find((a) => a.id === id)?.name ?? null;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t("templates.title")}
        description={t("templates.subtitle")}
        actions={
          <Button variant="accent" onClick={openCreate} disabled={full}>
            <Plus className="h-4 w-4" aria-hidden />
            {t("templates.new")}
          </Button>
        }
      />

      {isLoading ? (
        <div className="flex flex-col gap-2" aria-busy>
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-16 w-full rounded-xl" />
          ))}
        </div>
      ) : null}
      {!isLoading && isError ? <ErrorState error={error} onRetry={() => refetch()} /> : null}

      {!isLoading && !isError && templates.length === 0 ? (
        <div className="flex flex-col items-center gap-4 rounded-2xl border border-border bg-card px-6 py-12 text-center">
          <h2 className="text-lg font-semibold">{t("templates.empty.title")}</h2>
          <p className="max-w-md text-sm text-muted-foreground">
            {t("templates.empty.description")}
          </p>
          <Button variant="accent" onClick={openCreate}>
            <Plus className="h-4 w-4" aria-hidden />
            {t("templates.empty.create")}
          </Button>
        </div>
      ) : null}

      {templates.length > 0 ? (
        <ul aria-label={t("templates.listLabel")} className="flex flex-col gap-2">
          {templates.map((template) => {
            const meta = [
              t(`transactions.type.${template.type}`),
              accountName(template.bankAccountId),
              nameOf(template.categoryId),
            ].filter((part): part is string => Boolean(part));
            return (
              <li
                key={template.id}
                className="flex min-h-16 items-center gap-3 rounded-xl border border-border bg-card px-4 py-3"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-chip">
                  <CategoryIcon
                    categoryId={template.categoryId}
                    className="h-4 w-4 text-muted-foreground"
                  />
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="truncate font-semibold">{template.name}</span>
                  <span className="truncate text-xs text-muted-foreground">{meta.join(" · ")}</span>
                </span>
                <span className="shrink-0 text-right text-sm tabular-nums">
                  {template.amount && template.currency ? (
                    formatMoney(template.amount, {
                      currency: template.currency,
                      locale: i18n.language,
                    })
                  ) : (
                    <span className="text-muted-foreground">{t("templates.freeAmount")}</span>
                  )}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={t("templates.editNamed", { name: template.name })}
                  onClick={() => openEdit(template)}
                >
                  <Pencil className="h-4 w-4" aria-hidden />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={t("templates.deleteNamed", { name: template.name })}
                  onClick={() => setDeleting(template)}
                >
                  <Trash2 className="h-4 w-4" aria-hidden />
                </Button>
              </li>
            );
          })}
          <li className="pt-2 text-xs text-dim">
            {t("templates.limit", {
              count: templates.length,
              max: movementTemplates.MOVEMENT_TEMPLATE_MAX,
            })}
          </li>
        </ul>
      ) : null}

      <TemplateFormModal open={formOpen} onOpenChange={setFormOpen} template={editing} />

      <ConfirmModal
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        onConfirm={confirmDelete}
        title={t("templates.delete.title", { name: deleting?.name ?? "" })}
        description={t("templates.delete.description")}
        confirmLabel={t("templates.delete.confirm")}
        loading={remove.isPending}
      />
    </div>
  );
}
