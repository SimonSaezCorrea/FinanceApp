import { Pencil, Trash2, Zap } from "lucide-react";
import { useTranslation } from "react-i18next";

import type { accounts, movementTemplates } from "@finance/contracts";

import { cn } from "@finance/ui/src/shared/lib/cn";
import { Button } from "@finance/ui/src/shared/ui/button";
import { DetailRow } from "@finance/ui/src/shared/ui/detail-row";
import { amountToInput } from "../../../shared/lib/amountInput";
import { useCategoryCatalog } from "../../reference/hooks/useCategoryCatalog";
import { useRecurring } from "../../recurring/hooks/useRecurring";
import type { TransactionFormValue } from "../../transactions/components/TransactionFormPanel";
import { emptyTransactionForm } from "../../transactions/lib/emptyForm";
import { TemplatePreview } from "./TemplatePreview";

/** The template as the movement form would hold it — what the preview card draws. */
function previewForm(template: movementTemplates.MovementTemplate): TransactionFormValue {
  return {
    ...emptyTransactionForm(""),
    mode: template.type,
    amount: template.amount ? amountToInput(template.amount) : "",
    currency: template.currency ?? "CLP",
    bankAccountId: template.bankAccountId ?? "",
    cardId: template.cardId ?? "",
    categoryId: template.categoryId ?? "",
    recurringExpenseId: template.recurringExpenseId ?? "",
    financeCharge: template.financeCharge,
    description: template.description ?? "",
    emisor: template.emisor ?? "",
    receptor: template.receptor ?? "",
    lugar: template.lugar ?? "",
    observation: template.observation ?? "",
  };
}

/**
 * The open template in "Plantillas" (same layout as "Columnas propias"): the movement it
 * records as it will look when used, what it holds row by row, and the way to use, edit or
 * delete it.
 */
export function TemplateDetail({
  template,
  accounts: accountList,
  onUse,
  onEdit,
  onDelete,
  asScreen = false,
}: Readonly<{
  template: movementTemplates.MovementTemplate;
  accounts: accounts.BankAccount[];
  onUse: () => void;
  onEdit: () => void;
  onDelete: () => void;
  /** One column: the detail is its own screen, actions at full width. */
  asScreen?: boolean;
}>) {
  const { t } = useTranslation();
  const { nameOf } = useCategoryCatalog();
  const { data: series } = useRecurring();
  const account = accountList.find((a) => a.id === template.bankAccountId);
  const card = account?.cards.find((c) => c.id === template.cardId);
  const none = t("templates.detail.none");

  // Only what the template holds: an empty optional detail isn't worth a row.
  const rows: { label: string; value: string }[] = [
    { label: t("transactions.form.type"), value: t(`transactions.type.${template.type}`) },
    { label: t("transactions.form.account"), value: account?.name ?? none },
    ...(card
      ? [{ label: t("transactions.form.card"), value: `${card.name} ····${card.last4}` }]
      : []),
    {
      label: t("transactions.form.category"),
      value: nameOf(template.categoryId) ?? none,
    },
    {
      label: t("transactions.form.recurring"),
      value: series?.find((s) => s.id === template.recurringExpenseId)?.label ?? none,
    },
    ...(
      [
        ["emisor", template.emisor],
        ["receptor", template.receptor],
        ["lugar", template.lugar],
        ["observation", template.observation],
      ] as const
    )
      .filter(([, value]) => value)
      .map(([key, value]) => ({ label: t(`transactions.form.${key}`), value: value! })),
  ];

  return (
    <section
      className={cn(
        "flex min-w-0 flex-col gap-6",
        !asScreen && "rounded-2xl border border-border bg-card p-5 sm:p-7",
      )}
    >
      <header className="flex flex-wrap items-start justify-between gap-4">
        <h2 className={cn("truncate font-bold", asScreen ? "text-2xl" : "text-xl")} tabIndex={-1}>
          {template.name}
        </h2>
        <div className={cn("flex shrink-0 gap-2", asScreen && "w-full")}>
          <Button
            variant="primary"
            size={asScreen ? "md" : "sm"}
            className={cn(asScreen && "h-11 flex-1")}
            onClick={onUse}
          >
            <Zap className="h-4 w-4" aria-hidden />
            {t("templates.use")}
          </Button>
          <Button
            variant="outline"
            size={asScreen ? "md" : "sm"}
            className={cn(asScreen && "h-11")}
            onClick={onEdit}
          >
            <Pencil className="h-4 w-4" aria-hidden />
            {t("templates.detail.edit")}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className={cn("px-0 text-destructive", asScreen ? "h-11 w-11" : "h-9 w-9")}
            onClick={onDelete}
            aria-label={t("templates.deleteNamed", { name: template.name })}
          >
            <Trash2 className="h-4 w-4" aria-hidden />
          </Button>
        </div>
      </header>

      <TemplatePreview name={template.name} form={previewForm(template)} accounts={accountList} />

      <div className="flex flex-col">
        {rows.map((row) => (
          <DetailRow key={row.label} label={row.label} value={row.value} />
        ))}
      </div>
    </section>
  );
}
