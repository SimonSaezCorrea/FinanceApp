import { type FormEvent, type ReactNode, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { accounts as accountsContract } from "@finance/contracts";
import type { accounts } from "@finance/contracts";
import { formatMoney } from "@finance/money";

import { useCurrencies, useInstitutions } from "../../reference/hooks/useReference";
import { formatAmountDisplay, groupingLocaleFor } from "../../../shared/lib/amountInput";
import { cn } from "../../../shared/lib/cn";
import { useElementWidth } from "../../../shared/lib/useElementWidth";
import { Button } from "../../../shared/ui/button";
import { Field } from "../../../shared/ui/field";
import { Input } from "../../../shared/ui/input";
import { SearchableSelect } from "../../../shared/ui/searchable-select";
import { Segmented } from "../../../shared/ui/segmented";
import { Switch } from "../../../shared/ui/switch";
import { AccountTypeToggle } from "./AccountTypeToggle";

export interface AccountFormValues {
  name: string;
  type: accounts.AccountType;
  status: accounts.AccountStatus;
  institutionId: string;
  accountNumber: string;
  currency: string;
  initialBalance: string;
  creditLimit: string;
  creditUsedInitial: string;
  /** "" = no cycle configured (all-time usage), else a "1"-"28" day-of-month string. */
  billingCycleDay: string;
  /** "" = this account has no minimum payment; else a percentage like "5". */
  minimumPaymentPercent: string;
  paymentMethod: accounts.BillingPaymentMethod;
}

const EMPTY: AccountFormValues = {
  name: "",
  type: "CHECKING",
  status: "ACTIVE",
  institutionId: "",
  accountNumber: "",
  currency: "CLP",
  initialBalance: "0",
  creditLimit: "0",
  creditUsedInitial: "0",
  billingCycleDay: "",
  minimumPaymentPercent: "",
  paymentMethod: "MANUAL",
};

interface Props {
  initial?: Partial<AccountFormValues>;
  submitting?: boolean;
  submitLabel: string;
  /** Whether this account already has a CREDIT-kind card (added via CardsAside,
   * after account creation) — broadens the credit-pool fields the same way a
   * CREDIT_LINE account gets them, without hiding this account's own balance. */
  hasCreditCard?: boolean;
  /** Rendered next to the submit button; without it the footer has submit only. */
  onCancel?: () => void;
  /** Destructive action shown at the very end of the form, phone widths only. */
  dangerZone?: ReactNode;
  /** Set when the host renders the submit button itself (a window's footer),
   * pointing at it with `form="<id>"` — one form, one action bar. */
  formId?: string;
  hideFooter?: boolean;
  /** Reports pending edits so the host can show the marker outside the form
   * (a page header) and guard navigation away from it. */
  onDirtyChange?: (dirty: boolean) => void;
  /** Drives the account's status from OUTSIDE the form (the edit panel puts the
   * switch in its header, beside the account name). When set, the form drops its
   * own "Estado" section and mirrors this value into the data it submits. */
  status?: accounts.AccountStatus;
  onStatusChange?: (status: accounts.AccountStatus) => void;
  onSubmit: (values: AccountFormValues) => void;
}

/**
 * Width the FORM itself needs before the title/description can sit in a column
 * beside the fields: the label column is 14rem plus a 2rem gap, and under this
 * the fields get squeezed into a strip too narrow for a two-up row.
 *
 * Measured on the form, not the viewport. This layout used to switch at the `xl`
 * breakpoint, which was right while editing was a full-width screen and wrong the
 * moment the same form moved into a side panel: a 1400px window with a 660px
 * panel still matched `xl`, so the labels took their column and the fields lost
 * their format.
 */
const SECTION_LABEL_MIN_WIDTH = 860;

/**
 * One titled group of fields. The title/description column splits off only when
 * the form is wide enough for it; otherwise the title sits above its fields.
 */
function FormSection({
  title,
  description,
  hideTitleOnMobile = false,
  sideLabel,
  children,
}: Readonly<{
  title: string;
  description?: string;
  /** The first section's heading is noise on a phone — the screen title already
   * says what is being edited, and the fields below it are self-labelled. */
  hideTitleOnMobile?: boolean;
  /** Enough room to put the title beside the fields instead of above them. */
  sideLabel?: boolean;
  children: ReactNode;
}>) {
  return (
    <section
      className={cn(
        "grid gap-4 border-t border-border px-4 py-5 first:border-t-0 sm:px-6",
        sideLabel && "grid-cols-[14rem_1fr] gap-8",
      )}
    >
      <div className={cn(sideLabel && "pt-1", hideTitleOnMobile && "max-sm:hidden")}>
        <h2
          className={cn(
            "text-sm font-semibold uppercase tracking-wide text-brand",
            sideLabel && "text-base normal-case tracking-normal text-foreground",
          )}
        >
          {title}
        </h2>
        {description && sideLabel ? (
          <p className="mt-1 text-xs text-muted-foreground">{description}</p>
        ) : null}
      </div>
      <div className="flex flex-col gap-4">{children}</div>
    </section>
  );
}

export function AccountForm({
  initial,
  submitting,
  submitLabel,
  hasCreditCard = false,
  onCancel,
  dangerZone,
  formId,
  hideFooter = false,
  onDirtyChange,
  status,
  onStatusChange,
  onSubmit,
}: Readonly<Props>) {
  const { t, i18n } = useTranslation();
  const [initialValues] = useState<AccountFormValues>({ ...EMPTY, ...initial });
  const [values, setValues] = useState<AccountFormValues>(initialValues);
  const isCreditLineType = values.type === "CREDIT_LINE";
  const { data: institutions } = useInstitutions(
    "CL",
    accountsContract.institutionKindForAccountType(values.type),
  );
  const { data: currencies } = useCurrencies();

  const set = <K extends keyof AccountFormValues>(k: K, v: AccountFormValues[K]) =>
    setValues((prev) => ({ ...prev, [k]: v }));

  // The status can be driven from outside (the edit panel's header switch). It is
  // READ from the prop rather than copied into state by an effect: mirroring it
  // would mean a setState during render-commit, i.e. a second render per toggle
  // and two places claiming to own the same value.
  const submitted: AccountFormValues = status ? { ...values, status } : values;

  // Compared against the values the form opened with, so undoing an edit by hand
  // clears the warning instead of leaving it stuck on for the rest of the session.
  const dirty = (Object.keys(submitted) as (keyof AccountFormValues)[]).some(
    (k) => submitted[k] !== initialValues[k],
  );

  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    onSubmit(submitted);
  }

  const institutionOptions = [
    { value: "", label: t("accounts.form.institutionNone") },
    ...(institutions ?? []).map((b) => ({ value: b.id, label: b.name })),
  ];
  const currencyOptions = (currencies ?? []).map((c) => ({
    value: c.code,
    label: `${c.name} (${c.code})`,
  }));
  // Ensure the current currency is selectable even before the list loads.
  if (values.currency && !currencyOptions.some((o) => o.value === values.currency)) {
    currencyOptions.unshift({ value: values.currency, label: values.currency });
  }

  const [formRef, formWidth] = useElementWidth();
  // Until measured, stack: it works at every width, so a wrong first guess is a
  // cosmetic downgrade rather than a squeezed two-column row.
  const sideLabel = formWidth !== null && formWidth >= SECTION_LABEL_MIN_WIDTH;

  const hasCreditPool = isCreditLineType || hasCreditCard;
  const locale = groupingLocaleFor(values.currency, i18n.language);
  const limitNum = Number(values.creditLimit || 0);
  const usedNum = Number(values.creditUsedInitial || 0);
  const availablePct = limitNum > 0 ? Math.min(100, Math.max(0, (usedNum / limitNum) * 100)) : 0;

  return (
    // Measured on the form itself: the same markup is rendered as a full-width
    // screen and inside a side panel, and only its own width says which layout
    // fits (see SECTION_LABEL_MIN_WIDTH).
    <form ref={formRef} id={formId} className="flex flex-col" onSubmit={handleSubmit}>
      <FormSection
        sideLabel={sideLabel}
        title={t("accounts.form.sections.identification")}
        description={t("accounts.form.sections.identificationHint")}
        hideTitleOnMobile
      >
        <Field label={t("accounts.form.name")}>
          <Input
            id="acc-name"
            value={values.name}
            required
            onChange={(e) => set("name", e.target.value)}
            aria-label={t("accounts.form.name")}
          />
        </Field>
        <Field label={t("accounts.form.type")}>
          <AccountTypeToggle
            value={values.type}
            // A prepaid account can't be converted into anything else, nor anything
            // else into one (ACCOUNT_TYPE_CHANGE_NOT_ALLOWED): the API refuses it,
            // so the form never offers it.
            disabledTypes={
              initialValues.type === "PREPAID"
                ? accountsContract.accountType.options.filter((o) => o !== "PREPAID")
                : ["PREPAID"]
            }
            disabledReason={t("errors.ACCOUNT_TYPE_CHANGE_NOT_ALLOWED")}
            onChange={(next) =>
              setValues((prev) => {
                if (next === "CASH") {
                  return { ...prev, type: next, institutionId: "", accountNumber: "" };
                }
                const requiredKind = accountsContract.institutionKindForAccountType(next);
                const selected = institutions?.find((i) => i.id === prev.institutionId);
                const keepInstitution =
                  !requiredKind || !selected || selected.kind === requiredKind;
                return {
                  ...prev,
                  type: next,
                  ...(keepInstitution ? {} : { institutionId: "" }),
                };
              })
            }
          />
        </Field>
        {values.type !== "CASH" ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t("accounts.form.institution")}>
              <SearchableSelect
                id="acc-inst"
                value={values.institutionId}
                onChange={(v) => set("institutionId", v)}
                options={institutionOptions}
                searchPlaceholder={t("common.search")}
                noResultsLabel={t("common.noResults")}
                aria-label={t("accounts.form.institution")}
              />
            </Field>
            <Field label={t("accounts.form.accountNumber")}>
              <Input
                id="acc-num"
                value={values.accountNumber}
                inputMode="numeric"
                required={accountsContract.isAccountNumberRequired(values.type)}
                placeholder={
                  accountsContract.isAccountNumberRequired(values.type)
                    ? undefined
                    : t("accounts.form.optional")
                }
                onChange={(e) => set("accountNumber", e.target.value)}
                aria-label={t("accounts.form.accountNumber")}
              />
            </Field>
          </div>
        ) : null}
      </FormSection>

      <FormSection
        sideLabel={sideLabel}
        title={
          hasCreditPool ? t("accounts.form.sections.credit") : t("accounts.form.sections.balance")
        }
        description={
          hasCreditPool
            ? t("accounts.form.sections.creditHint")
            : t("accounts.form.sections.balanceHint")
        }
      >
        <div className="grid grid-cols-[6.5rem_1fr] gap-3 sm:gap-4">
          <Field label={t("accounts.form.currency")}>
            <SearchableSelect
              id="acc-cur"
              value={values.currency}
              onChange={(v) => set("currency", v)}
              options={currencyOptions}
              displayValue={values.currency}
              searchPlaceholder={t("common.search")}
              noResultsLabel={t("common.noResults")}
              aria-label={t("accounts.form.currency")}
            />
          </Field>
          {isCreditLineType ? (
            <Field label={t("accounts.form.creditLimit")}>
              <Input
                id="acc-climit"
                className="text-right"
                value={formatAmountDisplay(values.creditLimit, locale)}
                inputMode="numeric"
                disabled={hasCreditCard}
                onChange={(e) => set("creditLimit", e.target.value.replace(/\D/g, ""))}
                aria-label={t("accounts.form.creditLimit")}
              />
            </Field>
          ) : (
            <Field label={t("accounts.form.initialBalance")}>
              <Input
                id="acc-bal"
                className="text-right"
                value={formatAmountDisplay(values.initialBalance, locale)}
                inputMode="numeric"
                onChange={(e) => set("initialBalance", e.target.value.replace(/\D/g, ""))}
                aria-label={t("accounts.form.initialBalance")}
              />
            </Field>
          )}
        </div>

        {/* A checking/sight account that grew a CREDIT card also needs the account-level
            pool that card draws on — CREDIT_LINE already shows it above instead of a balance.
            Once a primary card exists, its limit IS this value — edit it from the card instead. */}
        {!isCreditLineType && hasCreditCard ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t("accounts.form.creditLimit")}>
              <Input
                id="acc-climit2"
                className="text-right"
                value={formatAmountDisplay(values.creditLimit, locale)}
                inputMode="numeric"
                disabled
                aria-label={t("accounts.form.creditLimit")}
              />
            </Field>
            <Field label={t("accounts.form.creditUsedInitial")}>
              <Input
                id="acc-cused2"
                className="text-right"
                value={formatAmountDisplay(values.creditUsedInitial, locale)}
                inputMode="numeric"
                disabled
                aria-label={t("accounts.form.creditUsedInitial")}
              />
            </Field>
          </div>
        ) : null}
        {isCreditLineType ? (
          <Field label={t("accounts.form.creditUsedInitial")}>
            <Input
              id="acc-cused"
              className="text-right"
              value={formatAmountDisplay(values.creditUsedInitial, locale)}
              inputMode="numeric"
              disabled={hasCreditCard}
              aria-label={t("accounts.form.creditUsedInitial")}
              onChange={(e) => set("creditUsedInitial", e.target.value.replace(/\D/g, ""))}
            />
          </Field>
        ) : null}
        {hasCreditCard ? (
          <p className="text-xs text-muted-foreground">
            {t("accounts.form.creditLimitMirroredHint")}
          </p>
        ) : null}

        {/* What the two numbers above actually mean for the user, so the
            consequence of an edit is visible without doing the subtraction. */}
        {hasCreditPool && limitNum > 0 ? (
          <div className="rounded-lg border border-border bg-muted/30 p-3">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-sm text-muted-foreground">
                {t("accounts.form.availableResult")}
              </span>
              <span className="text-sm font-semibold tabular-nums">
                {formatMoney(String(Math.max(0, limitNum - usedNum)), {
                  currency: values.currency,
                  locale,
                })}
              </span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-track">
              <div className="h-full rounded-full bg-brand" style={{ width: `${availablePct}%` }} />
            </div>
          </div>
        ) : null}
      </FormSection>

      {hasCreditPool ? (
        <FormSection
          sideLabel={sideLabel}
          title={t("accounts.form.sections.billing")}
          description={t("accounts.form.sections.billingHint")}
        >
          {/* Not a grid with a fixed first column: at 7rem the day's label wrapped
              onto two lines while the segmented beside it kept its full width, so
              the pair read as broken. Here each field takes the width it needs —
              the day is a two-digit box, the method fills the rest — and the
              method drops to its own row when they no longer fit side by side. */}
          <div className="flex flex-wrap items-end gap-4">
            <Field label={t("accounts.form.billingCycleDay")}>
              <Input
                className="w-24"
                id="acc-billing-day"
                inputMode="numeric"
                placeholder={t("accounts.form.billingCycleDayPlaceholder")}
                value={values.billingCycleDay}
                onChange={(e) => {
                  const digits = e.target.value.replace(/\D/g, "").slice(0, 2);
                  set("billingCycleDay", digits && Number(digits) > 28 ? "28" : digits);
                }}
                aria-label={t("accounts.form.billingCycleDay")}
              />
            </Field>
            <Field label={t("accounts.form.minimumPercent")}>
              <Input
                className="w-24"
                inputMode="decimal"
                placeholder="5"
                value={values.minimumPaymentPercent}
                onChange={(e) => {
                  // 0-100, at most two decimals — the column's own precision.
                  const clean = e.target.value.replace(/[^\d.]/g, "").slice(0, 6);
                  set("minimumPaymentPercent", Number(clean) > 100 ? "100" : clean);
                }}
                aria-label={t("accounts.form.minimumPercent")}
              />
            </Field>
            <Field label={t("accounts.form.paymentMethod")} className="min-w-[15rem] flex-1">
              <Segmented
                value={values.paymentMethod}
                onChange={(v) => set("paymentMethod", v)}
                className="w-full"
                options={[
                  { value: "MANUAL", label: t("accounts.form.paymentMethodManual") },
                  {
                    value: "AUTOMATIC",
                    label: t("accounts.form.paymentMethodAutomatic"),
                    disabled: true,
                    disabledReason: t("accounts.form.paymentMethodAutomaticLocked"),
                  },
                ]}
                aria-label={t("accounts.form.paymentMethod")}
              />
            </Field>
          </div>
          {/* Same muted style as every other hint in this form: in brand green it
              read as a warning about something being wrong, not as help text. */}
          <p className="text-xs text-muted-foreground">{t("accounts.form.billingCycleDayHint")}</p>
          <p className="text-xs text-muted-foreground">{t("accounts.form.minimumPercentHint")}</p>
        </FormSection>
      ) : null}

      {onStatusChange ? null : (
        <FormSection
          sideLabel={sideLabel}
          title={t("accounts.form.sections.status")}
          description={t("accounts.form.sections.statusHint")}
        >
          <label className="flex items-start gap-3">
            <Switch
              checked={values.status === "ACTIVE"}
              onCheckedChange={(checked) => set("status", checked ? "ACTIVE" : "INACTIVE")}
              aria-label={t("accounts.form.accountActive")}
            />
            <span>
              <span className="block text-sm font-medium">{t("accounts.form.accountActive")}</span>
              <span className="block text-xs text-muted-foreground">
                {t("accounts.form.accountActiveHint")}
              </span>
            </span>
          </label>
        </FormSection>
      )}

      {dangerZone ? (
        // Bottom of the form on a phone, far from the thumb's resting position —
        // on the wider layout the same action lives in the page header instead.
        <div className="border-t border-border px-4 py-5 sm:hidden">{dangerZone}</div>
      ) : null}

      {/* Sticky so the primary action stays under the thumb on a phone, where the
          form is several screens tall — the dirty warning rides along with it. */}
      {hideFooter ? null : (
        <div className="sticky bottom-0 z-10 flex items-center justify-end gap-2 border-t border-border bg-card px-4 py-4 sm:px-6">
          {onCancel ? (
            <Button type="button" variant="outline" onClick={onCancel} className="max-sm:hidden">
              {t("common.cancel")}
            </Button>
          ) : null}
          <Button
            type="submit"
            variant="accent"
            disabled={submitting}
            className="max-sm:h-[50px] max-sm:w-full max-sm:text-base"
          >
            {submitLabel}
          </Button>
        </div>
      )}
    </form>
  );
}
