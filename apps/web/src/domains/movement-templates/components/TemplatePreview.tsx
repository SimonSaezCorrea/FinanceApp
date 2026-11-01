import { CalendarDays, Eye } from "lucide-react";
import { useTranslation } from "react-i18next";

import type { accounts } from "@finance/contracts";
import { formatMoney } from "@finance/money";

import { cn } from "@finance/ui/src/shared/lib/cn";
import { CategoryIcon } from "../../reference/components/CategoryIcon";
import { useCategoryCatalog } from "../../reference/hooks/useCategoryCatalog";
import { useRecurring } from "../../recurring/hooks/useRecurring";
import type { TransactionFormValue } from "../../transactions/components/TransactionFormPanel";

/**
 * The movement a template records, drawn the way it will look when used: the form below
 * feeds it, so what the person is building is visible while they build it (canvas
 * "Nueva plantilla", design B). The date is never part of it: it's the day of use.
 */
export function TemplatePreview({
  name,
  form,
  accounts: accountList,
}: Readonly<{
  name: string;
  form: TransactionFormValue;
  accounts: accounts.BankAccount[];
}>) {
  const { t, i18n } = useTranslation();
  const { nameOf } = useCategoryCatalog();
  const { data: series } = useRecurring();
  const income = form.mode === "INCOME";
  const account = accountList.find((a) => a.id === form.bankAccountId);
  const card = account?.cards.find((c) => c.id === form.cardId);
  const title = form.description.trim() || name.trim() || t("templates.preview.untitled");
  const where = [
    form.lugar.trim() || form.receptor.trim() || form.emisor.trim(),
    card ? `${card.name} ····${card.last4}` : account?.name,
  ]
    .filter(Boolean)
    .join(" · ");
  const category = nameOf(form.categoryId || null);
  const recurring = series?.find((s) => s.id === form.recurringExpenseId)?.label;
  const chips = [category, recurring].filter((c): c is string => !!c);

  return (
    <section aria-label={t("templates.preview.label")} className="flex flex-col gap-2">
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Eye className="size-3.5" aria-hidden />
        {t("templates.preview.label")}
      </p>
      <div className="rounded-2xl border border-input bg-surface2 p-4">
        <div className="flex items-center gap-3">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-chip">
            <CategoryIcon categoryId={form.categoryId || null} className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold">{title}</p>
            <p className="truncate text-sm text-muted-foreground">
              {where || t("templates.preview.noAccount")}
            </p>
          </div>
          {form.amount ? (
            <span
              className={cn(
                "shrink-0 text-lg font-semibold tabular-nums",
                income ? "text-success" : "text-destructive",
              )}
            >
              {income ? "+" : "−"}
              {formatMoney(form.amount, { currency: form.currency, locale: i18n.language })}
            </span>
          ) : (
            <span className="shrink-0 text-sm text-muted-foreground">
              {t("templates.freeAmount")}
            </span>
          )}
        </div>
        {chips.length > 0 ? (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {chips.map((chip) => (
              <span key={chip} className="rounded-full bg-chip px-2 py-1 text-xs">
                {chip}
              </span>
            ))}
          </div>
        ) : null}
        <p className="mt-3 flex items-center gap-1.5 border-t border-dashed border-input pt-2.5 text-sm text-muted-foreground">
          <CalendarDays className="size-4" aria-hidden />
          {t("templates.preview.date")}
        </p>
      </div>
    </section>
  );
}
