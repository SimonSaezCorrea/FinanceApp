import { useState } from "react";
import { Plus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { accounts as accountsContract } from "@finance/contracts";
import type { accounts } from "@finance/contracts";
import { formatMoney } from "@finance/money";

import { formatAmountDisplay, groupingLocaleFor } from "../../../shared/lib/amountInput";
import { ApiRequestError } from "../../../shared/lib/apiClient";
import { Button } from "../../../shared/ui/button";
import { SidePanel } from "../../../shared/ui/overlay";
import { Field } from "../../../shared/ui/field";
import { Input } from "../../../shared/ui/input";
import { SearchableSelect } from "../../../shared/ui/searchable-select";
import { useCurrencies, useInstitutions } from "../../reference/hooks/useReference";
import { useAccountMutations } from "../hooks/useAccounts";
import { cleanExpiryInput, parseExpiry } from "../lib/cardExpiry";
import { ACCOUNT_ICON } from "./accountVisuals";
import { AccountTypeToggle } from "./AccountTypeToggle";
import { CardFormPanel } from "./CardFormPanel";
import { CardPreview } from "./CardPreview";
import { DraftCardTile } from "./DraftCardTile";

function SectionLabel({ children }: Readonly<{ children: string }>) {
  return (
    <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
      {children}
    </span>
  );
}

export function AccountCreateModal({
  open,
  onOpenChange,
  holder,
}: Readonly<{
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Name printed on the card preview tile. Comes from the route, which already
   *  knows the user — this component shouldn't need the auth context to draw. */
  holder?: string;
}>) {
  const { t, i18n } = useTranslation();
  const { create } = useAccountMutations();
  const [name, setName] = useState("");
  const [type, setType] = useState<accounts.AccountType>("CHECKING");
  const { data: institutions } = useInstitutions(
    "CL",
    accountsContract.institutionKindForAccountType(type),
  );
  const { data: currencies } = useCurrencies();
  const [institutionId, setInstitutionId] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [currency, setCurrency] = useState("CLP");
  const [initialBalance, setInitialBalance] = useState("0");
  const [creditLimit, setCreditLimit] = useState("0");
  const [creditUsedInitial, setCreditUsedInitial] = useState("0");
  // For a CREDIT_LINE account, these identify its PRIMARY card directly (in
  // place of a bank "account number", which doesn't apply — there's no
  // account behind a standalone credit card, only the card itself). Its limit
  // is the account's own creditLimit/creditUsedInitial above; no separate
  // "add card" step is needed for the primary anymore.
  const [primaryLast4, setPrimaryLast4] = useState("");
  const [primaryExpiry, setPrimaryExpiry] = useState("");
  const [primaryLast4Error, setPrimaryLast4Error] = useState<string | null>(null);
  const [primaryExpiryError, setPrimaryExpiryError] = useState<string | null>(null);
  const [cards, setCards] = useState<accounts.CreateCard[]>([]);
  const [addingCard, setAddingCard] = useState(false);
  const isCreditLineType = type === "CREDIT_LINE";
  // For any OTHER cardable type (checking/sight growing an add-on card), the
  // first drafted CREDIT card becomes the PRIMARY (mirrors the account's own
  // cupo 1:1) — once one exists, the cupo is read-only here. For CREDIT_LINE
  // itself this concept doesn't apply anymore: the primary is always the one
  // defined by `primaryLast4`/`primaryExpiry` above, so every card drafted in
  // the "Tarjetas" section is an ADDITIONAL one (see `hasExistingPrimary` below).
  const primaryDraftCard = !isCreditLineType ? cards.find((c) => c.kind === "CREDIT") : undefined;
  const hasCreditCard = primaryDraftCard !== undefined;
  const derivedCreditLimit = primaryDraftCard?.limits?.[0]?.limitAmount ?? "0";
  // No card yet: the account-level cupo fields are still manually editable
  // (e.g. a CREDIT_LINE created before its first card is added later) — for
  // CREDIT_LINE this is now always true, since the cupo always comes straight
  // from these fields (the primary card mirrors them, never the other way).
  const manualCreditPool = isCreditLineType || !hasCreditCard;
  const hasCreditPool = isCreditLineType || hasCreditCard;
  const cardable = accountsContract.isCardableAccountType(type);

  function reset() {
    setName("");
    setType("CHECKING");
    setInstitutionId("");
    setAccountNumber("");
    setCurrency("CLP");
    setInitialBalance("0");
    setCreditLimit("0");
    setCreditUsedInitial("0");
    setPrimaryLast4("");
    setPrimaryExpiry("");
    setPrimaryLast4Error(null);
    setPrimaryExpiryError(null);
    setCards([]);
    setAddingCard(false);
  }

  function handleTypeChange(next: accounts.AccountType) {
    setType(next);
    // Drafted cards that the new type can't carry are dropped, not silently
    // submitted into a rejection (a prepaid card can't move to a checking account
    // and a debit one can't move to a prepaid account).
    setCards((prev) => prev.filter((c) => accountsContract.isCardKindAllowed(next, c.kind)));
    if (!accountsContract.isCardableAccountType(next)) {
      setCards([]);
      setAddingCard(false);
    }
    if (next === "CASH") {
      setInstitutionId("");
      setAccountNumber("");
    } else {
      const requiredKind = accountsContract.institutionKindForAccountType(next);
      const selected = institutions?.find((i) => i.id === institutionId);
      if (requiredKind && selected && selected.kind !== requiredKind) {
        setInstitutionId("");
      }
    }
    if (next === "CREDIT_LINE") {
      setAccountNumber("");
    } else {
      setPrimaryLast4("");
      setPrimaryExpiry("");
      setPrimaryLast4Error(null);
      setPrimaryExpiryError(null);
    }
  }

  function submit() {
    let parsedPrimaryExpiry: { month: number; year: number } | null = null;
    if (isCreditLineType) {
      const validLast4 = /^\d{4}$/.test(primaryLast4);
      parsedPrimaryExpiry = parseExpiry(primaryExpiry);
      setPrimaryLast4Error(validLast4 ? null : t("cards.errors.last4"));
      setPrimaryExpiryError(parsedPrimaryExpiry ? null : t("cards.errors.expiry"));
      if (!validLast4 || !parsedPrimaryExpiry) return;
    }
    // The primary card is always first in `cards[]` so the backend's "first
    // CREDIT card becomes primary" resolution picks it up automatically.
    const autoPrimaryCard: accounts.CreateCard | undefined =
      isCreditLineType && parsedPrimaryExpiry
        ? {
            name: t("cards.kind.CREDIT"),
            kind: "CREDIT",
            last4: primaryLast4,
            expiryMonth: parsedPrimaryExpiry.month,
            expiryYear: parsedPrimaryExpiry.year,
            isActive: true,
            usesAccountPool: true,
            limits: [{ currency, limitAmount: creditLimit || "0" }],
          }
        : undefined;
    const allCards = autoPrimaryCard ? [autoPrimaryCard, ...cards] : cards;

    create.mutate(
      {
        name,
        type,
        status: "ACTIVE",
        paymentMethod: "MANUAL",
        currency,
        institutionId: institutionId || undefined,
        accountNumber: isCreditLineType ? undefined : accountNumber || undefined,
        initialBalance: isCreditLineType ? "0" : initialBalance || "0",
        creditLimit: manualCreditPool ? creditLimit || "0" : undefined,
        creditUsedInitial: manualCreditPool ? creditUsedInitial || "0" : undefined,
        cards: allCards.length > 0 ? allCards : undefined,
      },
      {
        onSuccess: () => {
          reset();
          onOpenChange(false);
        },
        onError: (err) => {
          const code = err instanceof ApiRequestError ? err.code : "INTERNAL_ERROR";
          toast.error(t(`errors.${code}`, { defaultValue: t("errors.INTERNAL_ERROR") }));
        },
      },
    );
  }

  const institutionName = institutions?.find((b) => b.id === institutionId)?.name ?? "";
  const institutionOptions = [
    { value: "", label: t("accounts.form.institutionNone") },
    ...(institutions ?? []).map((b) => ({ value: b.id, label: b.name })),
  ];
  const currencyOptions = (currencies ?? []).map((c) => ({
    value: c.code,
    label: `${c.name} (${c.code})`,
  }));
  if (currency && !currencyOptions.some((o) => o.value === currency)) {
    currencyOptions.unshift({ value: currency, label: currency });
  }

  const balancePreview = (() => {
    try {
      return formatMoney(initialBalance || "0", { locale: i18n.language, currency });
    } catch {
      return initialBalance;
    }
  })();

  // What the tile in the card panel previews: the account as typed so far. The
  // form only reads currency/limit off it, but the tile renders a whole account,
  // so the unset fields carry neutral zeros rather than invented values.
  const draftAccount: accounts.BankAccount = {
    id: "draft",
    name,
    type,
    status: "ACTIVE",
    currency,
    institution: null,
    institutionId: institutionId || null,
    institutionName: null,
    accountNumber: accountNumber || null,
    initialBalance: initialBalance || "0",
    currentBalance: initialBalance || "0",
    creditLimit: creditLimit || "0",
    creditUsed: creditUsedInitial || "0",
    creditPools: [],
    billingCycleDay: null,
    paymentMethod: "MANUAL",
    minimumPaymentPercent: null,
    balanceSeries: [],
    balanceChangePct: null,
    cards: [],
    createdAt: "",
    updatedAt: "",
  };

  return (
    <SidePanel
      open={open}
      onOpenChange={onOpenChange}
      title={t("accounts.new")}
      description={t("accounts.newSubtitle")}
      footer={
        <div className="flex items-center justify-between gap-4">
          <p className="text-xs text-muted-foreground max-sm:hidden">
            {t("accounts.form.editLaterHint")}
          </p>
          <div className="flex shrink-0 gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              {t("common.cancel")}
            </Button>
            <Button variant="accent" onClick={submit} disabled={create.isPending || !name}>
              {t("accounts.form.createSubmit")}
            </Button>
          </div>
        </div>
      }
    >
      <div className="grid gap-6 md:grid-cols-2">
        <div className="flex flex-col gap-3">
          <SectionLabel>{t("accounts.form.sectionAccountData")}</SectionLabel>
          <Field label={t("accounts.form.name")}>
            <Input
              id="m-name"
              value={name}
              required
              onChange={(e) => setName(e.target.value)}
              aria-label={t("accounts.form.name")}
            />
          </Field>
          <Field label={t("accounts.form.type")}>
            <AccountTypeToggle value={type} onChange={handleTypeChange} />
          </Field>
          {type !== "CASH" ? (
            <>
              <Field label={t("accounts.form.institution")}>
                <SearchableSelect
                  id="m-inst"
                  value={institutionId}
                  onChange={setInstitutionId}
                  options={institutionOptions}
                  searchPlaceholder={t("common.search")}
                  noResultsLabel={t("common.noResults")}
                  aria-label={t("accounts.form.institution")}
                />
              </Field>
              {isCreditLineType ? (
                <div className="grid grid-cols-2 gap-3">
                  <Field label={t("cards.form.last4")} error={primaryLast4Error}>
                    <Input
                      id="m-primary-last4"
                      inputMode="numeric"
                      autoComplete="off"
                      placeholder="4821"
                      maxLength={4}
                      value={primaryLast4}
                      onChange={(e) =>
                        setPrimaryLast4(e.target.value.replace(/\D/g, "").slice(0, 4))
                      }
                      aria-label={t("cards.form.last4")}
                    />
                  </Field>
                  <Field label={t("cards.form.expiry")} error={primaryExpiryError}>
                    <Input
                      id="m-primary-expiry"
                      inputMode="numeric"
                      placeholder="MM/AA"
                      value={primaryExpiry}
                      onChange={(e) => setPrimaryExpiry(cleanExpiryInput(e.target.value))}
                      aria-label={t("cards.form.expiry")}
                    />
                  </Field>
                </div>
              ) : (
                <Field label={t("accounts.form.accountNumber")}>
                  <Input
                    id="m-num"
                    inputMode="numeric"
                    value={accountNumber}
                    required={accountsContract.isAccountNumberRequired(type)}
                    onChange={(e) => setAccountNumber(e.target.value)}
                    aria-label={t("accounts.form.accountNumber")}
                  />
                </Field>
              )}
              {isCreditLineType ? (
                <p className="-mt-2 text-xs text-muted-foreground">
                  {t("accounts.form.primaryCardHint")}
                </p>
              ) : null}
            </>
          ) : null}

          <SectionLabel>{t("accounts.form.sectionBalanceCurrency")}</SectionLabel>
          <div className="grid grid-cols-[6rem_1fr] gap-3">
            <Field label={t("accounts.form.currency")}>
              <SearchableSelect
                id="m-cur"
                value={currency}
                onChange={setCurrency}
                options={currencyOptions}
                displayValue={currency}
                searchPlaceholder={t("common.search")}
                noResultsLabel={t("common.noResults")}
                aria-label={t("accounts.form.currency")}
              />
            </Field>
            {isCreditLineType ? (
              <Field label={t("accounts.form.creditLimit")}>
                <Input
                  id="m-climit"
                  inputMode="numeric"
                  value={formatAmountDisplay(
                    hasCreditCard ? derivedCreditLimit : creditLimit,
                    groupingLocaleFor(currency, i18n.language),
                  )}
                  disabled={hasCreditCard}
                  onChange={(e) => setCreditLimit(e.target.value.replace(/\D/g, ""))}
                  aria-label={t("accounts.form.creditLimit")}
                />
              </Field>
            ) : (
              <Field label={t("accounts.form.initialBalance")}>
                <Input
                  id="m-bal"
                  inputMode="numeric"
                  value={formatAmountDisplay(
                    initialBalance,
                    groupingLocaleFor(currency, i18n.language),
                  )}
                  onChange={(e) => setInitialBalance(e.target.value.replace(/\D/g, ""))}
                  aria-label={t("accounts.form.initialBalance")}
                />
              </Field>
            )}
          </div>
          {hasCreditCard ? (
            <p className="-mt-2 text-xs text-muted-foreground">
              {t("accounts.form.creditLimitMirroredHint")}
            </p>
          ) : null}
          {/* A checking/sight account that grew a CREDIT card also needs the account-level
              pool that card draws on — CREDIT_LINE already shows it above instead of a balance. */}
          {!isCreditLineType && hasCreditCard ? (
            <div className="grid grid-cols-2 gap-3">
              <Field label={t("accounts.form.creditLimit")}>
                <Input
                  id="m-climit2"
                  inputMode="numeric"
                  value={formatAmountDisplay(
                    derivedCreditLimit,
                    groupingLocaleFor(currency, i18n.language),
                  )}
                  disabled
                  aria-label={t("accounts.form.creditLimit")}
                />
              </Field>
            </div>
          ) : null}
          {manualCreditPool ? (
            <Field label={t("accounts.form.creditUsedInitial")}>
              <Input
                id="m-cused"
                inputMode="numeric"
                value={formatAmountDisplay(
                  creditUsedInitial,
                  groupingLocaleFor(currency, i18n.language),
                )}
                aria-label={t("accounts.form.creditUsedInitial")}
                onChange={(e) => setCreditUsedInitial(e.target.value.replace(/\D/g, ""))}
              />
            </Field>
          ) : null}
          {hasCreditPool ? (
            <p className="-mt-2 rounded-md border border-dashed border-ring/60 p-2 text-xs text-muted-foreground">
              {t("accounts.form.billingNotConfiguredWarning")}
            </p>
          ) : null}
        </div>

        <div className="flex flex-col gap-4">
          <SectionLabel>{t("accounts.form.preview")}</SectionLabel>
          <CardPreview
            brand={institutionName || t("accounts.title")}
            title={name}
            subtitle={t(`accounts.type.${type}`)}
            primary={balancePreview}
            footerLeft={currency}
            footerRight={accountNumber || undefined}
            icon={ACCOUNT_ICON[type]}
          />
          {cardable ? (
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <SectionLabel>
                  {(() => {
                    const base = isCreditLineType ? t("cards.additionalTitle") : t("cards.title");
                    return cards.length > 0 ? `${base} · ${cards.length}` : base;
                  })()}
                </SectionLabel>
                {!addingCard ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setAddingCard(true)}
                  >
                    <Plus className="h-3.5 w-3.5" aria-hidden />
                    {t("cards.addShort")}
                  </Button>
                ) : null}
              </div>

              {cards.length === 0 && !addingCard ? (
                <div className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
                  <p>{t("cards.empty")}</p>
                  <p>{t("cards.emptyHint")}</p>
                </div>
              ) : null}

              {cards.length > 0 ? (
                // Its own scroller: drafting several cards otherwise grew this
                // column past the panel and pushed the account fields out of
                // reach. ~2.5 tiles tall, so there's a visible cue to scroll.
                <div className="scrollbar-thin -mr-1 max-h-[22rem] overflow-y-auto pr-1">
                  <div className="grid grid-cols-2 gap-3">
                    {cards.map((c, i) => (
                      <DraftCardTile
                        key={i}
                        card={c}
                        isPrimary={c === primaryDraftCard}
                        onRemove={() => setCards((p) => p.filter((_, j) => j !== i))}
                      />
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      {/* The SAME panel used to add a card to an existing account — tile preview
          included — so drafting one here and adding one later are the same
          screen. It only differs in where the card ends up: local state now, the
          API there. Rendered INSIDE this panel on purpose: Radix treats a layer
          outside the parent's tree as an outside click, so as a sibling it
          dismissed BOTH panels on cancel. */}
      <CardFormPanel
        // Remounted per opening, so a cancelled draft never reappears
        // half-filled the next time the panel opens.
        key={addingCard ? cards.length : "closed"}
        open={addingCard}
        onOpenChange={setAddingCard}
        // Narrower than the account panel it sits on, so that one stays visible.
        size="compact"
        account={draftAccount}
        holder={holder}
        // For CREDIT_LINE, the primary is always the one defined by the
        // "Últimos 4 dígitos"/"Vencimiento" fields above — every card drafted
        // here is an ADDITIONAL one, never the primary.
        hasExistingPrimary={isCreditLineType || cards.some((c) => c.kind === "CREDIT")}
        onSubmit={(card) => {
          setCards((p) => [...p, card]);
          setAddingCard(false);
        }}
      />
    </SidePanel>
  );
}
