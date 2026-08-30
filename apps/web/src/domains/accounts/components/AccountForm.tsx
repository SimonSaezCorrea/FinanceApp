import { type FormEvent, type ReactNode, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { accounts as accountsContract } from "@finance/contracts";
import type { accounts } from "@finance/contracts";
import { formatMoney } from "@finance/money";

import { institutionOption } from "../../reference/lib/institutionOption";
import { useCountries, useCurrencies, useInstitutions } from "../../reference/hooks/useReference";
import { formatAmountDisplay, groupingLocaleFor } from "../../../shared/lib/amountInput";
import { cn } from "../../../shared/lib/cn";
import { useElementWidth } from "../../../shared/lib/useElementWidth";
import { Button } from "../../../shared/ui/button";
import { Field } from "../../../shared/ui/field";
import { Input } from "../../../shared/ui/input";
import { SearchableSelect } from "../../../shared/ui/searchable-select";
import { Segmented } from "../../../shared/ui/segmented";
import { Switch } from "../../../shared/ui/switch";
import { Tabs } from "../../../shared/ui/tabs";
import { AccountTypeToggle } from "./AccountTypeToggle";

export interface AccountFormValues {
  name: string;
  type: accounts.AccountType;
  status: accounts.AccountStatus;
  institutionId: string;
  accountNumber: string;
  /** Transfer alias, in the markets that have one (Argentina). */
  accountAlias: string;
  /** ISO alpha-2 of the country whose institutions are offered. Not persisted on
   * the account — it is derived from the institution — but the form needs it to
   * know which catalogue to show and which number format to expect. */
  country: string;
  currency: string;
  initialBalance: string;
  /** "0" = no overdraft line on this account. */
  overdraftLimit: string;
  /** "" = no ceiling declared; else the most this account may hold. */
  balanceCeiling: string;
  creditLimit: string;
  creditUsedInitial: string;
  /** "" = no cycle configured (all-time usage), else a day-of-month or a count
   * of business days, depending on `billingCycleType`. */
  billingCycleDay: string;
  /** Días hábiles (default) or a fixed day-of-month. */
  billingCycleType: accounts.BillingCycleType;
  /** "" = no due date configured; else a day-of-month or a count of business
   * days, depending on `paymentDueCycleType`. */
  paymentDueDay: string;
  /** Días hábiles (default) or a fixed day-of-month — independent of
   * `billingCycleType` (generation may be one and payment the other). */
  paymentDueCycleType: accounts.BillingCycleType;
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
  accountAlias: "",
  country: "CL",
  currency: "CLP",
  initialBalance: "0",
  overdraftLimit: "0",
  balanceCeiling: "",
  creditLimit: "0",
  creditUsedInitial: "0",
  billingCycleDay: "",
  billingCycleType: "BUSINESS_DAY",
  paymentDueDay: "",
  paymentDueCycleType: "BUSINESS_DAY",
  minimumPaymentPercent: "",
  paymentMethod: "MANUAL",
};

interface Props {
  initial?: Partial<AccountFormValues>;
  submitting?: boolean;
  submitLabel: string;
  /** Whether this account already has a CREDIT-kind card (added via CardsAside,
   * after account creation) — broadens the credit-pool fields the same way a
   * CREDIT_CARD account gets them, without hiding this account's own balance. */
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

/** Which section is showing, when the form has enough of them to warrant tabs
 * (see `hasCreditPool` below) — a plain account never grows past two sections,
 * so it never shows a tab strip at all. */
type FormTab = "general" | "credit" | "billing";

/**
 * One titled group of fields. The title/description column splits off only when
 * the form is wide enough for it; otherwise the title sits above its fields.
 *
 * `bare` drops the heading/border/grid entirely — used when a tab strip
 * already names the section (see the tabbed layout in `AccountForm` below),
 * so repeating "Facturación" as both a tab label and a section heading would
 * be pure noise.
 */
function FormSection({
  title,
  description,
  hideTitleOnMobile = false,
  sideLabel,
  bare = false,
  children,
}: Readonly<{
  title: string;
  description?: string;
  /** The first section's heading is noise on a phone — the screen title already
   * says what is being edited, and the fields below it are self-labelled. */
  hideTitleOnMobile?: boolean;
  /** Enough room to put the title beside the fields instead of above them. */
  sideLabel?: boolean;
  /** No heading, no border, no grid — just the fields, padded like any other
   * section. For a section that lives under its own tab. */
  bare?: boolean;
  children: ReactNode;
}>) {
  if (bare) {
    return <div className="flex flex-col gap-4 px-4 py-5 sm:px-6">{children}</div>;
  }
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
  const [tab, setTab] = useState<FormTab>("general");
  const isCreditLineType = values.type === "CREDIT_CARD";
  const { data: institutions } = useInstitutions(
    values.country,
    accountsContract.institutionKindForAccountType(values.type),
    values.type,
  );
  // Unfiltered list, only to name the account's CURRENT institution if it no
  // longer offers this product (historical data: never silently dropped).
  const { data: allInstitutions } = useInstitutions(values.country);
  const { data: countries } = useCountries();
  const usesAlias = accountsContract.usesAccountAlias(values.country);
  const accountNumberInvalid =
    values.accountNumber.trim() !== "" &&
    !accountsContract.isValidAccountNumber(values.accountNumber, values.country);
  const accountAliasInvalid =
    values.accountAlias.trim() !== "" && !accountsContract.isValidAccountAlias(values.accountAlias);
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
    // Showing the error and saving anyway is worse than not validating at all:
    // the API refuses it too (INVALID_ACCOUNT_NUMBER / INVALID_ACCOUNT_ALIAS),
    // so stopping here is what keeps the two answers the same.
    if (accountNumberInvalid || accountAliasInvalid) return;
    onSubmit(submitted);
  }

  const institutionOptions = [
    { value: "", label: t("accounts.form.institutionNone") },
    ...(institutions ?? []).map(institutionOption),
  ];
  // Keep the saved institution selectable even if it doesn't offer this product
  // (the catalogue can change after the account was created).
  if (values.institutionId && !institutionOptions.some((o) => o.value === values.institutionId)) {
    const saved = allInstitutions?.find((i) => i.id === values.institutionId);
    if (saved) institutionOptions.splice(1, 0, institutionOption(saved));
  }
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
      {/* A plain account never grows past Identificación + Saldo — the tab
          strip only earns its place once a credit account adds Crédito and
          Facturación on top, which is also when a single long scroll starts
          to feel like unrelated settings dumped in one place. */}
      {hasCreditPool ? (
        <Tabs
          className="px-4 sm:px-6"
          value={tab}
          onChange={setTab}
          items={[
            { value: "general", label: t("accounts.form.tabs.general") },
            { value: "credit", label: t("accounts.form.tabs.credit") },
            { value: "billing", label: t("accounts.form.tabs.billing") },
          ]}
        />
      ) : null}
      <div className={cn(tab !== "general" && "hidden")}>
        <FormSection
          sideLabel={sideLabel}
          bare={hasCreditPool}
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
                  // Drop the institution only when it is KNOWN not to offer the new
                  // product. Read from the loaded objects (not from a refetch of the
                  // filtered list, which still holds the previous type's results).
                  const selected = allInstitutions?.find((i) => i.id === prev.institutionId);
                  const keepInstitution =
                    !selected ||
                    selected.accountTypes.length === 0 ||
                    selected.accountTypes.includes(next);
                  return {
                    ...prev,
                    type: next,
                    ...(keepInstitution ? {} : { institutionId: "" }),
                  };
                })
              }
            />
          </Field>
          {/* The overdraft is the floor of THIS balance, not a product of its own:
            only an account that holds spendable cash can be granted one. */}
          {accountsContract.allowsOverdraft(values.type) ? (
            <Field label={t("accounts.form.overdraftLimit")}>
              <Input
                id="acc-overdraft"
                className="text-right"
                value={formatAmountDisplay(values.overdraftLimit, locale)}
                inputMode="numeric"
                onChange={(e) => set("overdraftLimit", e.target.value.replace(/\D/g, ""))}
                aria-label={t("accounts.form.overdraftLimit")}
              />
              <p className="text-xs text-muted-foreground">
                {t("accounts.form.overdraftLimitHint")}
              </p>
            </Field>
          ) : null}
          {values.type !== "CASH" ? (
            <div className="grid gap-4 sm:grid-cols-2">
              {/* The country decides WHICH institutions exist and what an account
                number looks like there, so it is asked before both. */}
              <Field label={t("accounts.form.country")}>
                <SearchableSelect
                  id="acc-country"
                  value={values.country}
                  onChange={(v) =>
                    setValues((prev) => ({
                      ...prev,
                      country: v,
                      // An institution belongs to its country: keeping it here would
                      // silently attach a Chilean bank to an Argentine account.
                      institutionId: "",
                    }))
                  }
                  options={(countries ?? []).map((c) => ({
                    value: c.alpha2,
                    label: c.name,
                    keywords: [c.alpha2, c.alpha3],
                  }))}
                  displayValue={values.country}
                  searchPlaceholder={t("common.search")}
                  noResultsLabel={t("common.noResults")}
                  aria-label={t("accounts.form.country")}
                />
              </Field>
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
              <Field
                label={
                  usesAlias ? t("accounts.form.accountNumberCbu") : t("accounts.form.accountNumber")
                }
                error={accountNumberInvalid ? t("accounts.form.accountNumberInvalid") : null}
              >
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
              {/* Only where the market actually has aliases: showing an empty field
                labelled "alias" in Chile would invent a concept that isn't there. */}
              {usesAlias ? (
                <Field
                  label={t("accounts.form.accountAlias")}
                  error={accountAliasInvalid ? t("accounts.form.accountAliasInvalid") : null}
                >
                  <Input
                    id="acc-alias"
                    value={values.accountAlias}
                    placeholder={t("accounts.form.accountAliasPlaceholder")}
                    onChange={(e) => set("accountAlias", e.target.value)}
                    aria-label={t("accounts.form.accountAlias")}
                  />
                </Field>
              ) : null}
            </div>
          ) : null}
        </FormSection>
        {dangerZone ? (
          // Bottom of the General tab on a phone, far from the thumb's resting
          // position — on the wider layout the same action lives in the page
          // header instead.
          <div className="border-t border-border px-4 py-5 sm:hidden">{dangerZone}</div>
        ) : null}
      </div>

      <div className={cn(hasCreditPool && tab !== "credit" && "hidden")}>
        <FormSection
          sideLabel={sideLabel}
          bare={hasCreditPool}
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
            pool that card draws on — CREDIT_CARD already shows it above instead of a balance.
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
                <div
                  className="h-full rounded-full bg-brand"
                  style={{ width: `${availablePct}%` }}
                />
              </div>
            </div>
          ) : null}
        </FormSection>
      </div>

      {hasCreditPool ? (
        <div className={cn(tab !== "billing" && "hidden")}>
          <FormSection
            sideLabel={sideLabel}
            bare
            title={t("accounts.form.sections.billing")}
            description={t("accounts.form.sections.billingHint")}
          >
            {/* Generación y pago se configuran cada uno con su propio tipo de ciclo
              (días hábiles o día del mes) — un emisor puede generar en un día fijo
              del mes y aun así deber el pago N días hábiles después, o viceversa.
              El día/porcentaje va primero (lo que se escribe) y su selector de
              tipo después, más angosto — pareja consistente en las tres filas. */}
            <div className="flex items-end gap-4">
              <Field
                label={
                  values.billingCycleType === "BUSINESS_DAY"
                    ? t("accounts.form.billingCycleDayBusiness")
                    : t("accounts.form.billingCycleDay")
                }
              >
                <Input
                  className="w-24"
                  id="acc-billing-day"
                  inputMode="numeric"
                  placeholder={
                    values.billingCycleType === "BUSINESS_DAY"
                      ? t("accounts.form.billingCycleDayBusinessPlaceholder")
                      : t("accounts.form.billingCycleDayPlaceholder")
                  }
                  value={values.billingCycleDay}
                  onChange={(e) => {
                    const digits = e.target.value.replace(/\D/g, "").slice(0, 2);
                    set("billingCycleDay", digits && Number(digits) > 28 ? "28" : digits);
                  }}
                  aria-label={t("accounts.form.billingCycleDay")}
                />
              </Field>
              <Field label={t("accounts.form.billingCycleType")}>
                <Segmented
                  size="sm"
                  className="h-10 w-52"
                  value={values.billingCycleType}
                  onChange={(v) => set("billingCycleType", v)}
                  options={[
                    {
                      value: "BUSINESS_DAY",
                      label: t("accounts.form.billingCycleTypeBusinessDay"),
                    },
                    {
                      value: "CALENDAR_DAY",
                      label: t("accounts.form.billingCycleTypeCalendarDay"),
                    },
                  ]}
                  aria-label={t("accounts.form.billingCycleType")}
                />
              </Field>
            </div>
            <p className="text-xs text-muted-foreground">
              {values.billingCycleType === "BUSINESS_DAY"
                ? t("accounts.form.billingCycleDayBusinessHint")
                : t("accounts.form.billingCycleDayHint")}
            </p>

            <div className="border-t border-border" />

            <div className="flex items-end gap-4">
              <Field
                label={
                  values.paymentDueCycleType === "BUSINESS_DAY"
                    ? t("accounts.form.paymentDueDayBusiness")
                    : t("accounts.form.paymentDueDay")
                }
              >
                <Input
                  className="w-24"
                  inputMode="numeric"
                  placeholder={
                    values.paymentDueCycleType === "BUSINESS_DAY"
                      ? t("accounts.form.paymentDueDayBusinessPlaceholder")
                      : t("accounts.form.paymentDueDayPlaceholder")
                  }
                  value={values.paymentDueDay}
                  onChange={(e) => {
                    const digits = e.target.value.replace(/\D/g, "").slice(0, 2);
                    set("paymentDueDay", digits && Number(digits) > 28 ? "28" : digits);
                  }}
                  aria-label={t("accounts.form.paymentDueDay")}
                />
              </Field>
              <Field label={t("accounts.form.paymentDueCycleType")}>
                <Segmented
                  size="sm"
                  className="h-10 w-52"
                  value={values.paymentDueCycleType}
                  onChange={(v) => set("paymentDueCycleType", v)}
                  options={[
                    {
                      value: "BUSINESS_DAY",
                      label: t("accounts.form.billingCycleTypeBusinessDay"),
                    },
                    {
                      value: "CALENDAR_DAY",
                      label: t("accounts.form.billingCycleTypeCalendarDay"),
                    },
                  ]}
                  aria-label={t("accounts.form.paymentDueCycleType")}
                />
              </Field>
            </div>
            <p className="text-xs text-muted-foreground">
              {values.paymentDueCycleType === "BUSINESS_DAY"
                ? t("accounts.form.paymentDueDayBusinessHint")
                : t("accounts.form.paymentDueDayHint")}
            </p>

            <div className="border-t border-border" />

            <div className="flex items-end gap-4">
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
              <Field label={t("accounts.form.paymentMethod")}>
                <Segmented
                  size="sm"
                  className="h-10 w-52"
                  value={values.paymentMethod}
                  onChange={(v) => set("paymentMethod", v)}
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
            <p className="text-xs text-muted-foreground">{t("accounts.form.minimumPercentHint")}</p>
          </FormSection>
        </div>
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
