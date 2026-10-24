import { ArrowRightLeft, ChevronRight, Pencil, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";

import type { accounts, customFields } from "@finance/contracts";
import { formatMoney } from "@finance/money";

import { cn } from "@finance/ui/src/shared/lib/cn";
import { Button } from "@finance/ui/src/shared/ui/button";
import { buttonClasses } from "@finance/ui/src/shared/ui/button-classes";
import { useElementWidth } from "../../../shared/lib/useElementWidth";
import { FormNotice } from "../../../shared/ui/form";
import { MaskedAmount } from "../../profile/components/MaskedAmount";
import { useFieldSummary } from "../hooks/useCustomFields";
import { ValueRowsSkeleton } from "./CustomFieldsSkeleton";
import { displayValue } from "../lib/fieldValues";

interface Props {
  field: customFields.CustomField;
  accounts: readonly accounts.BankAccount[];
  onEdit: () => void;
  onDelete: () => void;
  /** Its own screen (one column, a phone): straight on the page, no card, with Editar and
   * delete at its foot instead of beside the title. */
  asScreen?: boolean;
}

/** Width the detail needs before its values fit as a table (value, count, one column per
 * currency, "Ver"); narrower, they stack as a list. */
const VALUES_TABLE_MIN_WIDTH = 560;

/** The query string that opens Movimientos filtered by one value of this field. */
function filterQuery(fieldId: string, key: string): string {
  const params = new URLSearchParams({ cf: fieldId });
  if (key === "empty") params.set("cfEmpty", "true");
  else if (key === "hasValue") params.set("cfHasValue", "true");
  else params.set("cfv", key);
  return params.toString();
}

/** "Gastos con tarjeta de crédito o débito, en todas las cuentas." — the scope read as a sentence. */
function scopeSentence(
  field: customFields.CustomField,
  accounts: readonly accounts.BankAccount[],
  t: (key: string, options?: Record<string, unknown>) => string,
  locale: string,
): string {
  const and = new Intl.ListFormat(locale, { type: "conjunction" });
  const or = new Intl.ListFormat(locale, { type: "disjunction" });
  const { movementKinds, cardKinds, accountIds } = field.scope;
  let what =
    movementKinds.length === 0
      ? t("customFields.scopeText.allMovements")
      : and.format(movementKinds.map((k) => t(`customFields.scopeText.kinds.${k}`)));
  what = what.charAt(0).toLocaleUpperCase(locale) + what.slice(1);
  if (cardKinds.length > 0) {
    const list = or.format(cardKinds.map((k) => t(`customFields.scopeText.cards.${k}`)));
    what = `${what} ${t("customFields.scopeText.withCards", { list })}`;
  }
  const names = accountIds.flatMap((id) => accounts.find((a) => a.id === id)?.name ?? []);
  const where =
    accountIds.length === 0
      ? t("customFields.scopeText.allAccounts")
      : t("customFields.scopeText.someAccounts", { list: and.format(names) });
  return t("customFields.scopeText.sentence", { what, where });
}

/**
 * The open column in "Columnas propias": what it applies to, its values with what they add up to
 * per currency (each a link to Movimientos filtered by it), and, on a yes/no column, the way to
 * transfer what is still "No".
 */
export function CustomFieldDetail({
  field,
  accounts,
  onEdit,
  onDelete,
  asScreen = false,
}: Readonly<Props>) {
  const { t, i18n } = useTranslation();
  const summary = useFieldSummary(field.id);
  const locale = i18n.language;
  // Narrow (a phone, or not measured yet): the values as a stacked list instead of a table.
  const [measure, width] = useElementWidth();
  const compact = width === null || width < VALUES_TABLE_MIN_WIDTH;

  const label = (key: string) => {
    if (key === "true") return t("customFields.values.yes");
    if (key === "false") return t("customFields.values.no");
    if (key === "empty") return t("customFields.values.empty");
    if (key === "hasValue") return t("customFields.values.hasValue");
    return field.options.find((o) => o.id === key)?.label ?? key;
  };

  const buckets = (summary.data?.buckets ?? []).filter((b) => b.total > 0);
  const currencies = [
    ...new Set(
      buckets.flatMap((b) =>
        b.currencyTotals
          .filter((c) => Number(c.expense) !== 0 || Number(c.income) !== 0)
          .map((c) => c.currency),
      ),
    ),
  ];
  const pending =
    field.type === "BOOLEAN" ? (buckets.find((b) => b.key === "false")?.total ?? 0) : 0;
  const defaultText =
    field.defaultValue === null ? null : displayValue(field, field.defaultValue, t, locale);
  /** One value's totals in one currency: spent, and received (green), or a dash. */
  const amountIn = (bucket: (typeof buckets)[number], currency: string) => {
    const c = bucket.currencyTotals.find((x) => x.currency === currency);
    const expense = c && Number(c.expense) !== 0 ? c.expense : null;
    const income = c && Number(c.income) !== 0 ? c.income : null;
    return (
      <span key={currency} className="flex flex-col items-end">
        {expense ? <MaskedAmount>{formatMoney(expense, { currency, locale })}</MaskedAmount> : null}
        {income ? (
          <span className="text-success">
            <MaskedAmount>{`+${formatMoney(income, { currency, locale })}`}</MaskedAmount>
          </span>
        ) : null}
        {!expense && !income ? <span className="text-dim">—</span> : null}
      </span>
    );
  };
  const valueLink = (bucket: (typeof buckets)[number]) => ({
    to: `/transactions?${filterQuery(field.id, bucket.key)}`,
    "aria-label": `${label(bucket.key)}: ${t("customFields.summary.movements", { count: bucket.total })}. ${t("customFields.summary.open")}`,
  });
  const gridColumns = {
    gridTemplateColumns: `minmax(8rem, 1fr) 7rem ${currencies.map(() => "9rem").join(" ")} 4rem`,
  };

  const actions = (
    <div className={cn("flex shrink-0 gap-2", asScreen && "w-full")}>
      <Button
        variant="outline"
        size={asScreen ? "md" : "sm"}
        className={cn(asScreen && "h-11 flex-1")}
        onClick={onEdit}
      >
        <Pencil className="h-4 w-4" aria-hidden />
        {t("customFields.detail.edit")}
      </Button>
      <Button
        variant="outline"
        size="sm"
        className={cn("px-0 text-destructive", asScreen ? "h-11 w-11" : "h-9 w-9")}
        onClick={onDelete}
        aria-label={`${t("customFields.delete.confirm")}: ${field.name}`}
      >
        <Trash2 className="h-4 w-4" aria-hidden />
      </Button>
    </div>
  );

  return (
    <section
      ref={measure}
      className={cn(
        "flex min-w-0 flex-col gap-6",
        !asScreen && "rounded-2xl border border-border bg-card p-5 sm:p-7",
      )}
    >
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-1.5">
          <h2 className={cn("truncate font-bold", asScreen ? "text-2xl" : "text-xl")} tabIndex={-1}>
            {field.name}
          </h2>
          <p className="text-sm text-muted-foreground">
            {scopeSentence(field, accounts, t, locale)}
            {defaultText ? ` ${t("customFields.scopeText.default", { value: defaultText })}` : null}
          </p>
        </div>
        {asScreen ? null : actions}
      </header>

      {field.scopeBroken ? (
        <FormNotice tone="warning">{t("customFields.scopeBroken")}</FormNotice>
      ) : null}

      {compact ? (
        <div className="flex flex-col gap-2">
          <h3 className="text-xs font-medium text-muted-foreground">
            {t("customFields.detail.values")}
          </h3>
          <ul className="flex flex-col divide-y divide-border rounded-xl border border-border">
            {summary.isLoading ? (
              <li>
                <ValueRowsSkeleton />
              </li>
            ) : null}
            {!summary.isLoading && buckets.length === 0 ? (
              <li className="px-4 py-3 text-sm text-muted-foreground">
                {t("customFields.detail.noValues")}
              </li>
            ) : null}
            {buckets.map((bucket) => (
              <li key={bucket.key}>
                <Link
                  {...valueLink(bucket)}
                  className="flex min-h-14 items-center gap-3 px-4 py-3 text-sm hover:bg-surface2"
                >
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span
                      className={bucket.key === "empty" ? "text-muted-foreground" : "font-semibold"}
                    >
                      {label(bucket.key)}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {t("customFields.summary.movements", { count: bucket.total })}
                    </span>
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-0.5 tabular-nums">
                    {currencies.map((currency) => amountIn(bucket, currency))}
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="scrollbar-thin overflow-x-auto rounded-xl border border-border">
          <div className="min-w-max text-sm">
            <div
              className="grid gap-4 bg-muted/50 px-4 py-2.5 text-xs font-medium text-muted-foreground"
              style={gridColumns}
            >
              <span>{t("customFields.detail.value")}</span>
              <span className="text-right">{t("customFields.detail.movements")}</span>
              {currencies.map((c) => (
                <span key={c} className="text-right">
                  {c}
                </span>
              ))}
              <span />
            </div>
            {summary.isLoading ? <ValueRowsSkeleton /> : null}
            {!summary.isLoading && buckets.length === 0 ? (
              <p className="border-t border-border px-4 py-3 text-muted-foreground">
                {t("customFields.detail.noValues")}
              </p>
            ) : null}
            {buckets.map((bucket) => (
              <div
                key={bucket.key}
                className="grid items-center gap-4 border-t border-border px-4 py-3 tabular-nums"
                style={gridColumns}
              >
                <span className={bucket.key === "empty" ? "text-muted-foreground" : "font-medium"}>
                  {label(bucket.key)}
                </span>
                <span className="text-right font-semibold">{bucket.total}</span>
                {currencies.map((currency) => amountIn(bucket, currency))}
                <Link {...valueLink(bucket)} className="text-right text-primary hover:underline">
                  {t("customFields.detail.view")}
                </Link>
              </div>
            ))}
          </div>
        </div>
      )}

      {pending > 0 ? (
        <div
          className={cn(
            "flex gap-4 rounded-xl bg-surface2 px-5 py-4",
            asScreen ? "flex-col" : "flex-wrap items-center justify-between",
          )}
        >
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <p className="font-semibold">
              {t("customFields.detail.pending", {
                count: pending,
                value: t("customFields.values.no"),
              })}
            </p>
            <p className="text-sm text-muted-foreground">
              {t("customFields.detail.pendingHint", { other: t("customFields.values.yes") })}
            </p>
          </div>
          <Link
            to={`/transactions?${filterQuery(field.id, "false")}&transferir=1`}
            className={buttonClasses({ className: cn(asScreen && "h-11 w-full") })}
          >
            <ArrowRightLeft className="h-4 w-4" aria-hidden />
            {t("customFields.cover.action")}
          </Link>
        </div>
      ) : null}

      <dl className={cn("grid gap-4 text-sm", asScreen ? "grid-cols-2" : "sm:grid-cols-3")}>
        <div className="flex flex-col gap-1">
          <dt className="text-muted-foreground">{t("customFields.detail.type")}</dt>
          <dd>{t(`customFields.type.${field.type}`)}</dd>
        </div>
        <div className="flex flex-col gap-1">
          <dt className="text-muted-foreground">{t("customFields.detail.default")}</dt>
          <dd>{defaultText ?? t("customFields.detail.noDefault")}</dd>
        </div>
        <div className="flex flex-col gap-1">
          <dt className="text-muted-foreground">{t("customFields.detail.column")}</dt>
          <dd>
            {field.showAsColumn
              ? t("customFields.detail.columnShown")
              : t("customFields.detail.columnHidden")}
          </dd>
        </div>
      </dl>
      {asScreen ? actions : null}
    </section>
  );
}
