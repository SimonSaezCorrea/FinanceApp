import { type FormEvent, type ReactNode, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { accounts as accountsContract } from "@finance/contracts";
import type { accounts } from "@finance/contracts";
import { formatMoney } from "@finance/money";

import { institutionOption } from "../../reference/lib/institutionOption";
import { useCountries, useCurrencies, useInstitutions } from "../../reference/hooks/useReference";
import { formatAmountDisplay, groupingLocaleFor } from "../../../shared/lib/amountInput";
import { cn } from "../../../shared/lib/cn";
import { currencyPickerLabel } from "../../../shared/lib/currencyLabel";
import { resolveCurrencySymbol } from "../../../shared/lib/currencySymbol";
import { Button } from "../../../shared/ui/button";
import { DetailRow } from "../../../shared/ui/detail-row";
import {
  FormBigTextField,
  FormMoreDetails,
  FormSelectField,
  FormTextField,
} from "../../../shared/ui/form";
import { SearchableSelect } from "../../../shared/ui/searchable-select";
import { SectionLabel } from "../../../shared/ui/section-label";
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

/** Which section is showing, when the form has enough of them to warrant tabs
 * (see `hasCreditPool` below) — a plain account never grows past two sections,
 * so it never shows a tab strip at all. */
type FormTab = "general" | "billing";

/**
 * One loose group of rows: a small muted caption (skipped when a tab strip
 * already names the group) over a tight list of `DetailRow`-shaped fields —
 * the same convention `AccountCreateModal` uses, so editing an account reads
 * as the same form as creating one instead of a different, boxier one.
 */
function FormSection({
  title,
  bare = false,
  children,
}: Readonly<{
  /** Omitted when `bare` — a section whose fields already self-label (the
   * balance hero) or that lives under its own tab needs no caption. */
  title?: string;
  bare?: boolean;
  children: ReactNode;
}>) {
  return (
    <div className="flex flex-col gap-2 border-t border-border py-5 first:border-t-0 first:pt-0">
      {bare || !title ? null : <SectionLabel>{title}</SectionLabel>}
      <div className="flex flex-col">{children}</div>
    </div>
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
    // so stopping here is what keeps the two answers the same. The name field
    // is a borderless hero with no native `required` of its own (same as
    // `AccountCreateModal`'s), so emptiness is guarded here instead.
    if (!submitted.name.trim() || accountNumberInvalid || accountAliasInvalid) return;
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
  // Short code as the label (CLP, UF, USD…), full name underneath — the
  // reverse of "Full name (CODE)" on one line, which just truncated in this
  // field's own narrow half-column ("Dólar est…").
  const currencyOptions = (currencies ?? []).map((c) => ({
    value: c.code,
    label: currencyPickerLabel(c.code),
    description: c.name,
  }));
  // Ensure the current currency is selectable even before the list loads.
  if (values.currency && !currencyOptions.some((o) => o.value === values.currency)) {
    currencyOptions.unshift({
      value: values.currency,
      label: currencyPickerLabel(values.currency),
      description: "",
    });
  }

  const hasCreditPool = isCreditLineType || hasCreditCard;
  const locale = groupingLocaleFor(values.currency, i18n.language);
  const limitNum = Number(values.creditLimit || 0);
  const usedNum = Number(values.creditUsedInitial || 0);
  const availablePct = limitNum > 0 ? Math.min(100, Math.max(0, (usedNum / limitNum) * 100)) : 0;

  return (
    <form id={formId} className="flex flex-col" onSubmit={handleSubmit}>
      {/* Name: hero, no visible label — shown above the tab strip since it
          names the account regardless of which tab (Crédito/Facturación) is
          open, not a field that belongs to either one. */}
      <FormBigTextField
        id="acc-name"
        value={values.name}
        onChange={(v) => set("name", v)}
        placeholder={t("accounts.form.namePlaceholder")}
        aria-label={t("accounts.form.name")}
        showEditIcon
        className="mb-4"
      />

      {/* A plain account never grows past Identificación + Saldo — the tab
          strip only earns its place once a credit account adds Crédito and
          Facturación on top, which is also when a single long scroll starts
          to feel like unrelated settings dumped in one place. */}
      {hasCreditPool ? (
        <Tabs
          value={tab}
          onChange={setTab}
          items={[
            // Identificación and Crédito share this same tab — a credit account's
            // limit/pool is as central to it as its name, not a settings page away.
            { value: "general", label: t("accounts.form.tabs.credit") },
            { value: "billing", label: t("accounts.form.tabs.billing") },
          ]}
        />
      ) : null}
      <div className={cn(tab !== "general" && "hidden")}>
        {/* Same field ORDER `AccountCreateModal` uses — name, balance/cupo hero,
            a divider, then type, then everything else — so editing an account
            reads as a continuation of creating one, not a differently laid out
            form. */}
        <FormSection bare>
          {/* Balance / cupo: hero figure, currency inline. */}
          <div className="pt-4">
            <SectionLabel>
              {isCreditLineType
                ? t("accounts.form.creditLimit")
                : t("accounts.form.initialBalance")}
            </SectionLabel>
            <div className="mt-2 flex items-baseline gap-3">
              <span className="shrink-0 text-2xl font-bold text-brand" aria-hidden>
                {resolveCurrencySymbol(values.currency, currencies, i18n.language)}
              </span>
              <input
                inputMode="numeric"
                value={formatAmountDisplay(
                  isCreditLineType ? values.creditLimit : values.initialBalance,
                  locale,
                )}
                onChange={(e) => {
                  const digits = e.target.value.replace(/\D/g, "");
                  if (isCreditLineType) set("creditLimit", digits);
                  else set("initialBalance", digits);
                }}
                placeholder="0"
                className="min-w-0 flex-1 border-0 bg-transparent p-0 text-3xl font-bold tabular-nums text-foreground focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60"
                aria-label={
                  isCreditLineType
                    ? t("accounts.form.creditLimit")
                    : t("accounts.form.initialBalance")
                }
              />
              <SearchableSelect
                id="acc-cur"
                variant="inline"
                className="w-auto shrink-0"
                value={values.currency}
                onChange={(v) => set("currency", v)}
                options={currencyOptions}
                displayValue={values.currency}
                searchPlaceholder={t("common.search")}
                noResultsLabel={t("common.noResults")}
                aria-label={t("accounts.form.currency")}
              />
            </div>
          </div>

          <div className="my-2 border-t border-border" />

          <DetailRow label={t("accounts.form.type")}>
            <AccountTypeToggle
              variant="inline"
              className="w-auto"
              value={values.type}
              // A prepaid account can't be converted into anything else, nor anything
              // else into one (ACCOUNT_TYPE_CHANGE_NOT_ALLOWED): the API refuses it,
              // so the form never offers it.
              disabledTypes={
                initialValues.type === "PREPAID"
                  ? accountsContract.accountType.options.filter((o) => o !== "PREPAID")
                  : ["PREPAID", "INVESTMENT"]
              }
              disabledReason={t("errors.ACCOUNT_TYPE_CHANGE_NOT_ALLOWED")}
              disabledReasonFor={{ INVESTMENT: t("accounts.form.investmentTypeLocked") }}
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
          </DetailRow>

          {/* A checking/sight account that grew a CREDIT card also needs the account-level
            pool that card draws on — CREDIT_CARD already shows it above instead of a balance.
            Once a primary card exists, its limit IS this value — edit it from the card instead. */}
          {!isCreditLineType && hasCreditCard ? (
            <>
              <FormTextField
                id="acc-climit2"
                label={t("accounts.form.creditLimit")}
                value={formatAmountDisplay(values.creditLimit, locale)}
                disabled
                onChange={() => {}}
              />
              <FormTextField
                id="acc-cused2"
                label={t("accounts.form.creditUsedInitial")}
                value={formatAmountDisplay(values.creditUsedInitial, locale)}
                disabled
                hint={t("accounts.form.creditLimitMirroredHint")}
                onChange={() => {}}
              />
            </>
          ) : null}
          {values.type !== "CASH" ? (
            <>
              {/* The country decides WHICH institutions exist and what an account
                number looks like there, so it is asked before both. */}
              <FormSelectField
                id="acc-country"
                label={t("accounts.form.country")}
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
                  label: `${c.name} · ${c.alpha2}`,
                  keywords: [c.alpha2, c.alpha3],
                }))}
              />
              <FormSelectField
                id="acc-inst"
                label={t("accounts.form.institution")}
                value={values.institutionId}
                onChange={(v) => set("institutionId", v)}
                options={institutionOptions}
              />
              {/* A credit-line account has no bank account number of its own — what
                it needs instead is its primary card (last4/expiry), managed from
                the card panel, not this field. */}
              {isCreditLineType ? null : (
                <FormTextField
                  id="acc-num"
                  label={
                    usesAlias
                      ? t("accounts.form.accountNumberCbu")
                      : t("accounts.form.accountNumber")
                  }
                  value={values.accountNumber}
                  required={accountsContract.isAccountNumberRequired(values.type)}
                  placeholder={
                    accountsContract.isAccountNumberRequired(values.type)
                      ? t("accounts.form.accountNumberPlaceholder")
                      : t("accounts.form.optional")
                  }
                  onChange={(v) => set("accountNumber", v)}
                  error={accountNumberInvalid ? t("accounts.form.accountNumberInvalid") : null}
                  showEditIcon
                />
              )}
              {/* Only where the market actually has aliases: showing an empty field
                labelled "alias" in Chile would invent a concept that isn't there. */}
              {usesAlias && !isCreditLineType ? (
                <FormTextField
                  id="acc-alias"
                  label={t("accounts.form.accountAlias")}
                  value={values.accountAlias}
                  placeholder={t("accounts.form.accountAliasPlaceholder")}
                  onChange={(v) => set("accountAlias", v)}
                  error={accountAliasInvalid ? t("accounts.form.accountAliasInvalid") : null}
                  showEditIcon
                />
              ) : null}
            </>
          ) : null}

          {/* Más detalles: a checking/sight account's overdraft floor, or a
              credit account's seeded starting usage — one extra, optional
              figure most accounts never touch, tucked below the fields every
              account has. */}
          {accountsContract.allowsOverdraft(values.type) || isCreditLineType ? (
            <FormMoreDetails
              className="mt-2"
              defaultOpen={
                initialValues.overdraftLimit !== "0" || initialValues.creditUsedInitial !== "0"
              }
              title={
                <>
                  {t("accounts.form.moreDetails")}{" "}
                  <span className="font-normal text-muted-foreground">
                    · {t("accounts.form.optional")}
                  </span>
                </>
              }
            >
              {accountsContract.allowsOverdraft(values.type) ? (
                <FormTextField
                  id="acc-overdraft"
                  label={t("accounts.form.overdraftLimit")}
                  value={formatAmountDisplay(values.overdraftLimit, locale)}
                  hint={t("accounts.form.overdraftLimitHint")}
                  onChange={(v) => set("overdraftLimit", v.replace(/\D/g, ""))}
                  showEditIcon
                />
              ) : null}
              {isCreditLineType ? (
                <FormTextField
                  id="acc-cused"
                  label={t("accounts.form.creditUsedInitial")}
                  value={formatAmountDisplay(values.creditUsedInitial, locale)}
                  onChange={(v) => set("creditUsedInitial", v.replace(/\D/g, ""))}
                  showEditIcon
                />
              ) : null}
            </FormMoreDetails>
          ) : null}

          {/* What the two numbers above actually mean for the user, so the
            consequence of an edit is visible without doing the subtraction. */}
          {hasCreditPool && limitNum > 0 ? (
            <div className="mt-2 rounded-lg border border-border bg-muted/30 p-3">
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
        {dangerZone ? (
          // Bottom of the tab on a phone, far from the thumb's resting
          // position — on the wider layout the same action lives in the page
          // header instead.
          <div className="border-t border-border py-5 sm:hidden">{dangerZone}</div>
        ) : null}
      </div>

      {hasCreditPool ? (
        <div className={cn(tab !== "billing" && "hidden")}>
          <FormSection bare title={t("accounts.form.sections.billing")}>
            {/* Generación y pago se configuran cada uno con su propio tipo de ciclo
              (días hábiles o día del mes) — un emisor puede generar en un día fijo
              del mes y aun así deber el pago N días hábiles después, o viceversa.
              El día/porcentaje y su selector de tipo comparten una sola fila —
              son una unidad, no dos ajustes distintos. */}
            {/* Field + hint share ONE bordered block (the row's own divider
              moves to the very bottom, after the hint) instead of a `DetailRow`
              whose own divider would otherwise land between the two. */}
            <div className="border-b border-border py-3 last:border-b-0">
              <DetailRow
                className="border-b-0 py-0"
                label={
                  values.billingCycleType === "BUSINESS_DAY"
                    ? t("accounts.form.billingCycleDayBusiness")
                    : t("accounts.form.billingCycleDay")
                }
              >
                <div className="flex items-center gap-3">
                  <input
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
                    className="h-8 w-12 border-0 bg-transparent p-0 text-right text-sm font-medium tabular-nums text-foreground placeholder:text-muted-foreground focus-visible:outline-none"
                  />
                  <Segmented
                    size="sm"
                    className="h-8"
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
                </div>
              </DetailRow>
              <p className="pt-1 text-xs text-muted-foreground">
                {values.billingCycleType === "BUSINESS_DAY"
                  ? t("accounts.form.billingCycleDayBusinessHint")
                  : t("accounts.form.billingCycleDayHint")}
              </p>
            </div>

            <div className="border-b border-border py-3 last:border-b-0">
              <DetailRow
                className="border-b-0 py-0"
                label={
                  values.paymentDueCycleType === "BUSINESS_DAY"
                    ? t("accounts.form.paymentDueDayBusiness")
                    : t("accounts.form.paymentDueDay")
                }
              >
                <div className="flex items-center gap-3">
                  <input
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
                    className="h-8 w-12 border-0 bg-transparent p-0 text-right text-sm font-medium tabular-nums text-foreground placeholder:text-muted-foreground focus-visible:outline-none"
                  />
                  <Segmented
                    size="sm"
                    className="h-8"
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
                </div>
              </DetailRow>
              <p className="pt-1 text-xs text-muted-foreground">
                {values.paymentDueCycleType === "BUSINESS_DAY"
                  ? t("accounts.form.paymentDueDayBusinessHint")
                  : t("accounts.form.paymentDueDayHint")}
              </p>
            </div>

            <FormTextField
              label={t("accounts.form.minimumPercent")}
              value={values.minimumPaymentPercent}
              hint={t("accounts.form.minimumPercentHint")}
              onChange={(v) => {
                // 0-100, at most two decimals — the column's own precision.
                const clean = v.replace(/[^\d.]/g, "").slice(0, 6);
                set("minimumPaymentPercent", Number(clean) > 100 ? "100" : clean);
              }}
              showEditIcon
            />

            <DetailRow label={t("accounts.form.paymentMethod")}>
              <Segmented
                size="sm"
                className="h-8 w-40"
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
            </DetailRow>
          </FormSection>
        </div>
      ) : null}

      {onStatusChange ? null : (
        <FormSection title={t("accounts.form.sections.status")}>
          <label className="flex items-center justify-between gap-4 py-3 text-sm">
            <span>
              <span className="block font-medium text-foreground">
                {t("accounts.form.accountActive")}
              </span>
              <span className="block text-xs text-muted-foreground">
                {t("accounts.form.accountActiveHint")}
              </span>
            </span>
            <Switch
              checked={values.status === "ACTIVE"}
              onCheckedChange={(checked) => set("status", checked ? "ACTIVE" : "INACTIVE")}
              aria-label={t("accounts.form.accountActive")}
            />
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
