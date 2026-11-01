import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useSearchParams } from "react-router";
import { toast } from "sonner";

import { movementTemplates } from "@finance/contracts";
import { formatMoney } from "@finance/money";

import { ApiRequestError } from "@finance/client";
import { cn } from "@finance/ui/src/shared/lib/cn";
import { Button } from "@finance/ui/src/shared/ui/button";
import { ConfirmModal } from "@finance/ui/src/shared/ui/overlay";
import { useAccounts } from "../../accounts/hooks/useAccounts";
import { CategoryIcon } from "../../reference/components/CategoryIcon";
import { TransactionCreateModal } from "../../transactions/components/TransactionCreateModal";
import { TEMPLATES_PANES_MIN_WIDTH, useElementWidth } from "../../../shared/lib/useElementWidth";
import { PageHeader } from "../../../shared/ui/page-header";
import { Skeleton } from "../../../shared/ui/skeleton";
import { ErrorState } from "../../../shared/ui/states";
import { TemplateDetail } from "../components/TemplateDetail";
import { TemplateFormModal } from "../components/TemplateFormModal";
import { useMovementTemplateMutations, useMovementTemplates } from "../hooks/useMovementTemplates";

/** Where the open template lives in the URL, so a link or a reload opens the same one. */
const OPEN_PARAM = "plantilla";

/**
 * "Plantillas" (specs/037): the person's reusable movements, laid out like "Columnas propias" —
 * a list beside the open template's detail (the movement it records, what it holds, and "Usar
 * plantilla"), or, narrower than `TEMPLATES_PANES_MIN_WIDTH` of its own width, the list alone
 * with each template opening as its own screen.
 */
export function TemplatesRoute() {
  const { t, i18n } = useTranslation();
  const { data, isLoading, isError, error, refetch } = useMovementTemplates();
  const { data: accounts } = useAccounts();
  const { remove } = useMovementTemplateMutations();
  const templates = isError ? [] : (data ?? []);
  const [measure, width] = useElementWidth();
  const panes = width !== null && width >= TEMPLATES_PANES_MIN_WIDTH;
  const [searchParams] = useSearchParams();
  const requestedId = searchParams.get(OPEN_PARAM);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<movementTemplates.MovementTemplate | undefined>();
  const [deleting, setDeleting] = useState<movementTemplates.MovementTemplate | null>(null);
  const [using, setUsing] = useState<string | null>(null);
  const full = templates.length >= movementTemplates.MOVEMENT_TEMPLATE_MAX;

  // The open template: the one in the URL, else (two panes) the first. In one column, none
  // means the list is the screen.
  const requested = templates.find((tpl) => tpl.id === requestedId);
  const open = requested ?? (panes ? templates[0] : undefined);
  const detailRef = useRef<HTMLDivElement | null>(null);
  const lastOpenId = useRef(open?.id);
  useEffect(() => {
    if (lastOpenId.current === open?.id) return;
    lastOpenId.current = open?.id;
    if (!requestedId) return;
    detailRef.current?.querySelector<HTMLElement>("h2")?.focus({ preventScroll: true });
    if (!panes) window.scrollTo?.({ top: 0 });
  }, [open?.id, requestedId, panes]);

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
  // One column with a template open: the detail is its own screen, with the way back on top
  // instead of the page header and its "Nueva plantilla".
  const detailScreen = !panes && open !== undefined;

  return (
    <div ref={measure} className="flex flex-col gap-6">
      {detailScreen ? null : (
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
      )}

      {isLoading ? (
        <div className={cn("flex gap-6", !panes && "flex-col")} aria-busy>
          <div className={cn("flex flex-col gap-2", panes && "w-72 shrink-0")}>
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-16 w-full rounded-xl" />
            ))}
          </div>
          {panes ? <Skeleton className="h-96 flex-1 rounded-2xl" /> : null}
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

      <div className={cn("flex gap-6", !panes && "flex-col")}>
        {templates.length > 0 && (panes || !open) ? (
          <nav
            aria-label={t("templates.listLabel")}
            className={cn("flex flex-col", panes ? "w-72 shrink-0 gap-1" : "gap-2")}
          >
            {templates.map((template) => {
              const active = panes && template.id === open?.id;
              const meta = [
                t(`transactions.type.${template.type}`),
                accountName(template.bankAccountId),
              ]
                .filter(Boolean)
                .join(" · ");
              return (
                <Link
                  key={template.id}
                  to={`?${OPEN_PARAM}=${template.id}`}
                  replace={panes}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex min-h-14 items-center gap-3 rounded-xl px-4 py-3 hover:bg-surface2",
                    !panes && "border border-border bg-card",
                    active && "bg-surface2 shadow-[inset_3px_0_0_hsl(var(--primary))]",
                  )}
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-chip">
                    <CategoryIcon
                      categoryId={template.categoryId}
                      className="h-4 w-4 text-muted-foreground"
                    />
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="truncate font-semibold">{template.name}</span>
                    <span className="truncate text-xs text-muted-foreground">{meta}</span>
                  </span>
                  <span
                    className={cn(
                      "shrink-0 text-right text-sm tabular-nums",
                      !template.amount && "text-muted-foreground",
                      template.amount &&
                        (template.type === "INCOME" ? "text-success" : "text-destructive"),
                    )}
                  >
                    {template.amount && template.currency
                      ? `${template.type === "INCOME" ? "+" : "−"}${formatMoney(template.amount, {
                          currency: template.currency,
                          locale: i18n.language,
                        })}`
                      : t("templates.freeAmount")}
                  </span>
                  {panes ? null : (
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                  )}
                </Link>
              );
            })}
            <p className={cn("pt-2 text-xs text-dim", panes && "px-4")}>
              {t("templates.limit", {
                count: templates.length,
                max: movementTemplates.MOVEMENT_TEMPLATE_MAX,
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
                {t("templates.back")}
              </Link>
            )}
            <TemplateDetail
              template={open}
              accounts={accounts ?? []}
              onUse={() => setUsing(open.id)}
              onEdit={() => openEdit(open)}
              onDelete={() => setDeleting(open)}
              asScreen={!panes}
            />
          </div>
        ) : null}
      </div>

      <TemplateFormModal open={formOpen} onOpenChange={setFormOpen} template={editing} />

      <TransactionCreateModal
        open={using !== null}
        onOpenChange={(next) => !next && setUsing(null)}
        initialTemplateId={using ?? undefined}
      />

      <ConfirmModal
        open={deleting !== null}
        onOpenChange={(next) => !next && setDeleting(null)}
        onConfirm={confirmDelete}
        title={t("templates.delete.title", { name: deleting?.name ?? "" })}
        description={t("templates.delete.description")}
        confirmLabel={t("templates.delete.confirm")}
        loading={remove.isPending}
      />
    </div>
  );
}
