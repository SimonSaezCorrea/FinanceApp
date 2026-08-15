import { type FormEvent, useEffect, useState } from "react";
import { Plus, X } from "lucide-react";
import { useTranslation } from "react-i18next";

import { accounts as accountsContract, type accounts } from "@finance/contracts";

import { useCurrencies } from "../../reference/hooks/useReference";
import { formatAmountDisplay, groupingLocaleFor } from "../../../shared/lib/amountInput";
import { Button } from "../../../shared/ui/button";
import { Field } from "../../../shared/ui/field";
import { Input } from "../../../shared/ui/input";
import { SearchableSelect } from "../../../shared/ui/searchable-select";
import { Segmented } from "../../../shared/ui/segmented";
import { Switch } from "../../../shared/ui/switch";
import { Select } from "../../../shared/ui/select";
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
  // CREDIT stays the default wherever it's allowed (the kind whose setup needs the
  // most from this form); a prepaid account offers only PREPAID, so it lands there.
  const [kind, setKind] = useState<accounts.CardKind>(
    initial?.kind ?? (kindOptions.includes("CREDIT") ? "CREDIT" : (kindOptions[0] ?? "CREDIT")),
  );
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
    label: `${c.name} (${c.code})`,
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
      <Field label={t("cards.form.name")}>
        <Input
          id="card-name"
          value={name}
          placeholder={t("cards.form.namePlaceholder")}
          onChange={(e) => setName(e.target.value)}
          aria-label={t("cards.form.name")}
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label={t("cards.form.kind")}>
          <Select
            id="card-kind"
            value={kind}
            onChange={(e) => setKind(e.target.value as accounts.CardKind)}
            // Only the kinds this account type may carry: the products are kept
            // apart, so a checking account never offers "prepago" and a prepaid
            // account offers nothing else.
            options={kindOptions.map((k) => ({ value: k, label: t(`cards.kind.${k}`) }))}
            disabled={kindOptions.length === 1}
            aria-label={t("cards.form.kind")}
          />
        </Field>
        <Field label={t("cards.form.expiry")} error={expiryError}>
          <Input
            id="card-expiry"
            inputMode="numeric"
            placeholder="MM/AA"
            value={expiry}
            onChange={(e) => setExpiry(cleanExpiryInput(e.target.value))}
            aria-label={t("cards.form.expiry")}
          />
        </Field>
      </div>
      <Field label={t("cards.form.network")}>
        <Select
          id="card-network"
          value={network}
          onChange={(e) => setNetwork(e.target.value as accounts.CardNetwork | "")}
          options={[
            { value: "", label: t("cards.form.networkNone") },
            ...accountsContract.cardNetwork.options.map((n) => ({
              value: n,
              label: t(`cards.network.${n}`),
            })),
          ]}
          aria-label={t("cards.form.network")}
        />
      </Field>
      <Field label={t("cards.form.last4")} error={last4Error}>
        <Input
          id="card-last4"
          inputMode="numeric"
          autoComplete="off"
          placeholder="4821"
          maxLength={4}
          value={last4}
          onChange={(e) => setLast4(e.target.value.replace(/\D/g, "").slice(0, 4))}
          aria-label={t("cards.form.last4")}
        />
      </Field>
      <p className="-mt-1 text-xs text-muted-foreground">{t("cards.form.last4Hint")}</p>
      <div className="flex flex-col gap-3 rounded-lg border border-border p-3">
        <div className="flex items-center justify-between gap-3 text-sm">
          <span>
            {t("cards.form.virtual")}
            <span className="block text-xs text-muted-foreground">
              {t("cards.form.virtualHint")}
            </span>
          </span>
          <Switch
            checked={isVirtual}
            onCheckedChange={setIsVirtual}
            aria-label={t("cards.form.virtual")}
          />
        </div>
        <div className="flex items-center justify-between gap-3 text-sm">
          <span>
            {t("cards.form.additional")}
            <span className="block text-xs text-muted-foreground">
              {t("cards.form.additionalHint")}
            </span>
          </span>
          <Switch
            checked={isAdditional}
            onCheckedChange={setIsAdditional}
            aria-label={t("cards.form.additional")}
          />
        </div>
        {/* Who carries it only matters once it IS someone else's card. */}
        {isAdditional ? (
          <Field label={t("cards.form.cardholder")}>
            <Input
              id="card-cardholder"
              value={cardholderName}
              placeholder={t("cards.form.cardholderPlaceholder")}
              onChange={(e) => setCardholderName(e.target.value)}
              aria-label={t("cards.form.cardholder")}
            />
          </Field>
        ) : null}
      </div>

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
              inputMode="numeric"
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
                      inputMode="numeric"
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
                      inputMode="numeric"
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
