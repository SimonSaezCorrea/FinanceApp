import { type FormEvent, useEffect, useState } from "react";
import { Plus, X } from "lucide-react";
import { useTranslation } from "react-i18next";

import { accounts as accountsContract, type accounts } from "@finance/contracts";

import { useCurrencies } from "../../reference/hooks/useReference";
import { formatAmountDisplay, groupingLocaleFor } from "../../../shared/lib/amountInput";
import { currencyPickerLabel } from "../../../shared/lib/currencyLabel";
import { Button } from "../../../shared/ui/button";
import { CollapsibleSection } from "../../../shared/ui/collapsible-section";
import { DetailRow } from "../../../shared/ui/detail-row";
import { Field } from "../../../shared/ui/field";
import { FormSelectField, FormSwitchField, FormTextField } from "../../../shared/ui/form";
import { Input } from "../../../shared/ui/input";
import { SearchableSelect } from "../../../shared/ui/searchable-select";
import { Segmented } from "../../../shared/ui/segmented";
import { Switch } from "../../../shared/ui/switch";
import { cleanExpiryInput, formatExpiry, parseExpiry } from "../lib/cardExpiry";

interface Props {
  submitLabel: string;
  submitting?: boolean;
  initial?: accounts.Card;
  /** The account's currency — the primary card's mandatory limit is always in it. */
  accountCurrency: string;
  /** The account's type: it decides which card kinds may be offered at all
   * (`accounts.allowedCardKinds`) — a prepaid account carries only prepaid cards,
   * and no other type carries one. */
  accountType: accounts.AccountType;
  /** Whether a DIFFERENT CREDIT card on this account already holds the primary slot
   * (excluding the card being edited, if any). false ⇒ this CREDIT card becomes/stays primary. */
  hasExistingPrimary: boolean;
  /** The account's current creditLimit — only used to prefill the mandatory field
   * when editing the account's existing primary card (whose own `limits` is always empty). */
  accountCreditLimit?: string;
  /** Set when the host renders the submit button itself (a surface footer),
   * pointing at it with `form="<id>"` — one form, one action bar. */
  formId?: string;
  hideSubmit?: boolean;
  /** Fires on every keystroke with the card as typed so far, for a host that
   * previews it (the detail surface's tile). Partial by design: `last4` may hold
   * fewer than 4 digits and the expiry may not parse yet. */
  onDraftChange?: (draft: CardDraft) => void;
  /** Drives the card's active state from OUTSIDE the form (a panel header, beside
   * the card name). When set, the form drops its own switch and submits this
   * value — same arrangement the account form uses for its status. */
  isActive?: boolean;
  onActiveChange?: (active: boolean) => void;
  onSubmit: (card: accounts.CreateCard) => void;
}

/** What a host can preview while the form is being filled in. */
export interface CardDraft {
  name: string;
  kind: accounts.CardKind;
  last4: string;
  expiryMonth: number | null;
  expiryYear: number | null;
  /** The primary's mandatory amount, or the first own-limit row. */
  limitAmount: string | null;
}

interface LimitDraft {
  currency: string;
  limitAmount: string;
}

/**
 * EXPERIMENT (2026-09-05): drops a plain text/number field's filled
 * `bg-background` AND its `border-input` outline (border-transparent keeps
 * the same 1px reserved, so nothing shifts) — tried here first before
 * considering it anywhere else. Reverted on every `Select`/`SearchableSelect`
 * dropdown in this form (2026-09-05): without a border it read as broken
 * rather than intentional — a picker needs the frame a plain field doesn't.
 * To revert what's left, delete this constant and its usages below; nothing
 * else about the fields (focus ring, layout) changes.
 */
const NO_FILL = "bg-transparent border-transparent";

/**
 * Collects a card (payment instrument). Only the last 4 digits are ever asked
 * for or stored — the full PAN never has a field to type into in the first
 * place. CREDIT-kind cards always resolve to a determinate limit before
 * saving: the account's first CREDIT card becomes its PRIMARY (its limit IS
 * the account's own shared pool, mandatory); any additional CREDIT card either
 * shares that pool (default) or carries its own sub-limit per currency.
 */
export function CardForm({
  submitLabel,
  submitting,
  initial,
  accountCurrency,
  accountType,
  hasExistingPrimary,
  accountCreditLimit,
  formId,
  hideSubmit = false,
  isActive: activeFromHost,
  onActiveChange,
  onDraftChange,
  onSubmit,
}: Readonly<Props>) {
  const { t, i18n } = useTranslation();
  const { data: currencies } = useCurrencies();
  const [name, setName] = useState(initial?.name ?? "");
  const kindOptions = accountsContract.allowedCardKinds(accountType);
  // The account's type decides the ONE kind a card on it can be
  // (`allowedCardKinds` never returns more than one option: CHECKING/SIGHT/
  // SAVINGS → DEBIT, CREDIT_CARD → CREDIT, PREPAID → PREPAID) — there is
  // nothing left to pick, so this isn't a form field, just a derived constant.
  const kind: accounts.CardKind = initial?.kind ?? (kindOptions[0] ?? "CREDIT");
  const [last4, setLast4] = useState(initial?.last4 ?? "");
  const [expiry, setExpiry] = useState(
    initial ? formatExpiry(initial.expiryMonth, initial.expiryYear) : "",
  );
  const [primaryLimitAmount, setPrimaryLimitAmount] = useState(
    initial?.isPrimary ? (accountCreditLimit ?? "") : "",
  );
  const [usesAccountPool, setUsesAccountPool] = useState(
    initial ? initial.limits.length === 0 : true,
  );
  const [limits, setLimits] = useState<LimitDraft[]>(
    initial?.limits.map((l) => ({ currency: l.currency, limitAmount: l.limitAmount })) ?? [],
  );
  // A card that is no longer in use but whose history must stay: deactivating it
  // keeps every past movement while taking the card out of the pickers. Read from
  // the host when it owns the control, so there's never a second copy to sync.
  const [ownActive, setOwnActive] = useState(initial?.isActive ?? true);
  const [isVirtual, setIsVirtual] = useState(initial?.isVirtual ?? false);
  const [isAdditional, setIsAdditional] = useState(initial?.isAdditional ?? false);
  const [cardholderName, setCardholderName] = useState(initial?.cardholderName ?? "");
  const [network, setNetwork] = useState<accounts.CardNetwork | "">(initial?.network ?? "");
  const isActive = activeFromHost ?? ownActive;
  const [last4Error, setLast4Error] = useState<string | null>(null);
  const [expiryError, setExpiryError] = useState<string | null>(null);
  const [limitError, setLimitError] = useState<string | null>(null);
  const parsedDraftExpiry = parseExpiry(expiry);
  // Reported from an effect, not from each setter: every field feeds the same
  // object, and one place to build it can't drift from another.
  useEffect(() => {
    onDraftChange?.({
      name,
      kind,
      last4,
      expiryMonth: parsedDraftExpiry?.month ?? null,
      expiryYear: parsedDraftExpiry?.year ?? null,
      limitAmount: primaryLimitAmount.trim() || (limits[0]?.limitAmount ?? null) || null,
    });
  }, [
    name,
    kind,
    last4,
    parsedDraftExpiry?.month,
    parsedDraftExpiry?.year,
    primaryLimitAmount,
    limits,
    onDraftChange,
  ]);

  const willBePrimary = kind === "CREDIT" && !hasExistingPrimary;
  const isAdditionalCredit = kind === "CREDIT" && hasExistingPrimary;

  const currencyOptions = (currencies ?? []).map((c) => ({
    value: c.code,
    label: currencyPickerLabel(c.code),
    description: c.name,
  }));
  // The primary's mandatory field already owns the account's own currency —
  // its optional extra-currency rows can only add OTHER currencies.
  const extraCurrencyOptions = currencyOptions.filter((o) => o.value !== accountCurrency);

  function addLimitRow(defaultCurrency: string) {
    setLimits((prev) => [...prev, { currency: defaultCurrency, limitAmount: "" }]);
  }
  function updateLimitRow(index: number, patch: Partial<LimitDraft>) {
    setLimits((prev) => prev.map((l, i) => (i === index ? { ...l, ...patch } : l)));
  }
  function removeLimitRow(index: number) {
    setLimits((prev) => prev.filter((_, i) => i !== index));
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    const validLast4 = /^\d{4}$/.test(last4);
    const parsedExpiry = parseExpiry(expiry);
    setLast4Error(validLast4 ? null : t("cards.errors.last4"));
    setExpiryError(parsedExpiry ? null : t("cards.errors.expiry"));

    let cardLimits: accounts.CreateCard["limits"];
    let poolFlag = true;
    setLimitError(null);
    if (willBePrimary) {
      const amount = primaryLimitAmount.trim();
      if (!amount || !(Number(amount) > 0)) {
        setLimitError(t("cards.errors.limitRequired"));
        return;
      }
      const extra = limits
        .filter((l) => l.currency !== accountCurrency && l.limitAmount.trim() !== "")
        .map((l) => ({ currency: l.currency, limitAmount: l.limitAmount }));
      cardLimits = [{ currency: accountCurrency, limitAmount: amount }, ...extra];
    } else if (isAdditionalCredit) {
      poolFlag = usesAccountPool;
      if (!usesAccountPool) {
        const cleanLimits = limits
          .filter((l) => l.limitAmount.trim() !== "")
          .map((l) => ({ currency: l.currency, limitAmount: l.limitAmount }));
        if (cleanLimits.length === 0) {
          setLimitError(t("cards.errors.limitRequired"));
          return;
        }
        cardLimits = cleanLimits;
      }
    }

    if (!validLast4 || !parsedExpiry) return;

    onSubmit({
      name: name.trim() || t(`cards.kind.${kind}`),
      kind,
      last4,
      expiryMonth: parsedExpiry.month,
      expiryYear: parsedExpiry.year,
      isActive,
      isVirtual,
      isAdditional,
      // Only meaningful on an additional card — a blank one means "the account
      // owner", which is what a null already says.
      cardholderName: isAdditional ? cardholderName.trim() || null : null,
      network: network === "" ? null : network,
      usesAccountPool: poolFlag,
      limits: cardLimits,
    });
  }

  return (
    <form id={formId} className="flex flex-col gap-3" onSubmit={submit}>
      <FormTextField
        id="card-name"
        label={t("cards.form.name")}
        value={name}
        onChange={setName}
        placeholder={t("cards.form.namePlaceholder")}
      />
      {/* Últimos 4 dígitos + Vencimiento share one row — both are short fields,
          and splitting them into two full-width rows just spent two dividers
          on data that reads naturally as a pair. */}
      <DetailRow label={t("cards.form.cardDetails")} className="items-end py-2">
        <div className="flex items-end gap-5">
          <div className="flex flex-col items-end">
            <span className="text-[10px] font-medium uppercase leading-tight tracking-wide text-muted-foreground">
              {t("cards.form.last4")}
            </span>
            <input
              id="card-last4"
              inputMode="numeric"
              autoComplete="off"
              maxLength={4}
              value={last4}
              onChange={(e) => setLast4(e.target.value.replace(/\D/g, "").slice(0, 4))}
              placeholder="4821"
              aria-label={t("cards.form.last4")}
              className="h-6 w-16 border-0 bg-transparent p-0 text-right text-sm font-medium leading-tight text-foreground placeholder:text-muted-foreground shadow-none focus-visible:outline-none focus-visible:ring-0"
            />
          </div>
          <div className="flex flex-col items-end">
            <span className="text-[10px] font-medium uppercase leading-tight tracking-wide text-muted-foreground">
              {t("cards.form.expiry")}
            </span>
            <input
              id="card-expiry"
              value={expiry}
              onChange={(e) => setExpiry(cleanExpiryInput(e.target.value))}
              placeholder="MM/AA"
              aria-label={t("cards.form.expiry")}
              className="h-6 w-14 border-0 bg-transparent p-0 text-right text-sm font-medium leading-tight text-foreground placeholder:text-muted-foreground shadow-none focus-visible:outline-none focus-visible:ring-0"
            />
          </div>
        </div>
      </DetailRow>
      {last4Error ? (
        <p role="alert" className="pb-1 pt-1 text-right text-xs text-destructive">
          {last4Error}
        </p>
      ) : null}
      {expiryError ? (
        <p role="alert" className="pb-1 pt-1 text-right text-xs text-destructive">
          {expiryError}
        </p>
      ) : null}
      <p className="pt-1 text-xs text-muted-foreground">{t("cards.form.last4Hint")}</p>

      {willBePrimary ? (
        <div className="flex flex-col gap-2 rounded-md border p-3">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t("cards.primaryBadge")}
          </span>
          <p className="-mt-1 text-xs text-muted-foreground">{t("cards.form.primaryLimitHint")}</p>
          <Field
            label={t("cards.form.primaryLimit", { currency: accountCurrency })}
            error={limitError}
          >
            <Input
              className={NO_FILL}
              inputMode="numeric"
              placeholder="0"
              value={formatAmountDisplay(
                primaryLimitAmount,
                groupingLocaleFor(accountCurrency, i18n.language),
              )}
              onChange={(e) => setPrimaryLimitAmount(e.target.value.replace(/\D/g, ""))}
              aria-label={t("cards.form.primaryLimit", { currency: accountCurrency })}
            />
          </Field>

          {extraCurrencyOptions.length > 0 ? (
            <div className="flex flex-col gap-2 border-t pt-2">
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {t("cards.form.extraLimits")}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="shrink-0 whitespace-nowrap"
                  onClick={() => addLimitRow(extraCurrencyOptions[0]!.value)}
                >
                  <Plus className="h-3.5 w-3.5" aria-hidden />
                  {t("cards.form.addLimit")}
                </Button>
              </div>
              <p className="-mt-1 text-xs text-muted-foreground">
                {t("cards.form.extraLimitsHint")}
              </p>

              {limits.map((limit, i) => (
                <div key={i} className="grid grid-cols-[1fr_1fr_auto] items-end gap-2">
                  <Field label={t("cards.form.currency")}>
                    <SearchableSelect
                      value={limit.currency}
                      onChange={(v) => updateLimitRow(i, { currency: v })}
                      options={extraCurrencyOptions}
                      displayValue={limit.currency}
                      searchPlaceholder={t("common.search")}
                      noResultsLabel={t("common.noResults")}
                      aria-label={t("cards.form.currency")}
                    />
                  </Field>
                  <Field label={t("cards.form.limit")}>
                    <Input
                      className={NO_FILL}
                      inputMode="numeric"
                      placeholder="0"
                      value={formatAmountDisplay(
                        limit.limitAmount,
                        groupingLocaleFor(limit.currency, i18n.language),
                      )}
                      onChange={(e) =>
                        updateLimitRow(i, { limitAmount: e.target.value.replace(/\D/g, "") })
                      }
                      aria-label={t("cards.form.limit")}
                    />
                  </Field>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => removeLimitRow(i)}
                    aria-label={t("common.delete")}
                  >
                    <X className="h-4 w-4" aria-hidden />
                  </Button>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {isAdditionalCredit ? (
        <div className="flex flex-col gap-2 rounded-md border p-3">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t("cards.form.limits")}
          </span>
          <Segmented
            value={usesAccountPool ? "pool" : "own"}
            onChange={(v) => setUsesAccountPool(v === "pool")}
            options={[
              { value: "pool", label: t("cards.form.usesPool") },
              { value: "own", label: t("cards.form.ownLimit") },
            ]}
            aria-label={t("cards.form.limits")}
          />
          <p className="-mt-1 text-xs text-muted-foreground">
            {usesAccountPool ? t("cards.form.usesPoolHint") : t("cards.form.ownLimitHint")}
          </p>

          {!usesAccountPool ? (
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs text-muted-foreground">
                  {limits.length === 0 ? t("cards.form.ownLimitRowsHint") : null}
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="shrink-0 whitespace-nowrap"
                  onClick={() => addLimitRow(accountCurrency)}
                >
                  <Plus className="h-3.5 w-3.5" aria-hidden />
                  {t("cards.form.addLimit")}
                </Button>
              </div>
              {limitError ? <p className="text-xs text-destructive">{limitError}</p> : null}

              {limits.map((limit, i) => (
                <div key={i} className="grid grid-cols-[1fr_1fr_auto] items-end gap-2">
                  <Field label={t("cards.form.currency")}>
                    <SearchableSelect
                      value={limit.currency}
                      onChange={(v) => updateLimitRow(i, { currency: v })}
                      options={currencyOptions}
                      displayValue={limit.currency}
                      searchPlaceholder={t("common.search")}
                      noResultsLabel={t("common.noResults")}
                      aria-label={t("cards.form.currency")}
                    />
                  </Field>
                  <Field label={t("cards.form.limit")}>
                    <Input
                      className={NO_FILL}
                      inputMode="numeric"
                      placeholder="0"
                      value={formatAmountDisplay(
                        limit.limitAmount,
                        groupingLocaleFor(limit.currency, i18n.language),
                      )}
                      onChange={(e) =>
                        updateLimitRow(i, { limitAmount: e.target.value.replace(/\D/g, "") })
                      }
                      aria-label={t("cards.form.limit")}
                    />
                  </Field>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => removeLimitRow(i)}
                    aria-label={t("common.delete")}
                  >
                    <X className="h-4 w-4" aria-hidden />
                  </Button>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      <CollapsibleSection title={t("cards.form.moreDetails")}>
        <div className="flex flex-col">
          <FormSwitchField
            label={t("cards.form.virtual")}
            checked={isVirtual}
            onChange={setIsVirtual}
          />
          <p className="pb-2 pt-1 text-xs text-muted-foreground">{t("cards.form.virtualHint")}</p>
          <FormSwitchField
            label={t("cards.form.additional")}
            checked={isAdditional}
            onChange={setIsAdditional}
          />
          <p className="pb-2 pt-1 text-xs text-muted-foreground">{t("cards.form.additionalHint")}</p>
          {/* Who carries it only matters once it IS someone else's card. */}
          {isAdditional ? (
            <FormTextField
              id="card-cardholder"
              label={t("cards.form.cardholder")}
              value={cardholderName}
              onChange={setCardholderName}
              placeholder={t("cards.form.cardholderPlaceholder")}
            />
          ) : null}
          <FormSelectField
            id="card-network"
            label={t("cards.form.network")}
            value={network}
            onChange={(v) => setNetwork(v as accounts.CardNetwork | "")}
            options={[
              { value: "", label: t("cards.form.networkNone") },
              ...accountsContract.cardNetwork.options.map((n) => ({
                value: n,
                label: t(`cards.network.${n}`),
              })),
            ]}
          />
        </div>
      </CollapsibleSection>

      {onActiveChange ? null : (
        <label className="flex items-center gap-3 border-t border-border pt-3">
          <Switch
            checked={isActive}
            onCheckedChange={setOwnActive}
            aria-label={t("cards.form.active")}
          />
          <span className="min-w-0">
            <span className="block text-sm font-medium">{t("cards.form.active")}</span>
            <span className="block text-xs text-muted-foreground">
              {t("cards.form.activeHint")}
            </span>
          </span>
        </label>
      )}

      {hideSubmit ? null : (
        <Button type="submit" disabled={submitting}>
          {submitLabel}
        </Button>
      )}
    </form>
  );
}
