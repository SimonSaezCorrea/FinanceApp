import { useState } from "react";
import { Plus, X } from "lucide-react";
import { useTranslation } from "react-i18next";

import { accounts as accountsContract } from "@finance/contracts";
import type { accounts } from "@finance/contracts";
import { formatMoney } from "@finance/money";

import { formatAmountDisplay, groupingLocaleFor } from "../../../shared/lib/amountInput";
import { Button } from "../../../shared/ui/button";
import { Dialog } from "../../../shared/ui/dialog";
import { Field } from "../../../shared/ui/field";
import { Input } from "../../../shared/ui/input";
import { Select } from "../../../shared/ui/select";
import { Switch } from "../../../shared/ui/switch";
import { useCurrencies, useInstitutions } from "../../reference/hooks/useReference";
import { useAccountMutations } from "../hooks/useAccounts";
import { ACCOUNT_ICON } from "./accountVisuals";
import { AccountTypeToggle } from "./AccountTypeToggle";
import { CardForm } from "./CardForm";
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
}: Readonly<{
  open: boolean;
  onOpenChange: (v: boolean) => void;
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
  const [status, setStatus] = useState<accounts.AccountStatus>("ACTIVE");
  const [currency, setCurrency] = useState("CLP");
  const [initialBalance, setInitialBalance] = useState("0");
  const [creditLimit, setCreditLimit] = useState("0");
  const [creditUsedInitial, setCreditUsedInitial] = useState("0");
  const [cards, setCards] = useState<accounts.CreateCard[]>([]);
  const [addingCard, setAddingCard] = useState(false);
  const isCreditLineType = type === "CREDIT_LINE";
  // The account's first drafted CREDIT card becomes its PRIMARY (mirrors the
  // account's own cupo 1:1) — once one exists, the cupo is read-only here,
  // driven by that card's own mandatory limit instead of typed independently.
  const primaryDraftCard = cards.find((c) => c.kind === "CREDIT");
  const hasCreditCard = primaryDraftCard !== undefined;
  const derivedCreditLimit = primaryDraftCard?.limits?.[0]?.limitAmount ?? "0";
  // No card yet: the account-level cupo fields are still manually editable
  // (e.g. a CREDIT_LINE created before its first card is added later).
  const manualCreditPool = isCreditLineType && !hasCreditCard;
  const cardable = accountsContract.isCardableAccountType(type);

  function reset() {
    setName("");
    setType("CHECKING");
    setInstitutionId("");
    setAccountNumber("");
    setStatus("ACTIVE");
    setCurrency("CLP");
    setInitialBalance("0");
    setCreditLimit("0");
    setCreditUsedInitial("0");
    setCards([]);
    setAddingCard(false);
  }

  function handleTypeChange(next: accounts.AccountType) {
    setType(next);
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
  }

  function submit() {
    create.mutate(
      {
        name,
        type,
        status,
        currency,
        institutionId: institutionId || undefined,
        accountNumber: accountNumber || undefined,
        initialBalance: isCreditLineType ? "0" : initialBalance || "0",
        creditLimit: manualCreditPool ? creditLimit || "0" : undefined,
        creditUsedInitial: manualCreditPool ? creditUsedInitial || "0" : undefined,
        cards: cards.length > 0 ? cards : undefined,
      },
      {
        onSuccess: () => {
          reset();
          onOpenChange(false);
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
    label: `${c.code} · ${c.name}`,
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

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={t("accounts.new")}
      description={t("accounts.newSubtitle")}
      className="max-w-3xl"
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
                <Select
                  id="m-inst"
                  value={institutionId}
                  onChange={(e) => setInstitutionId(e.target.value)}
                  options={institutionOptions}
                  aria-label={t("accounts.form.institution")}
                />
              </Field>
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
            </>
          ) : null}

          <SectionLabel>{t("accounts.form.sectionBalanceCurrency")}</SectionLabel>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t("accounts.form.currency")}>
              <Select
                id="m-cur"
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                options={currencyOptions}
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
                  value={formatAmountDisplay(initialBalance, groupingLocaleFor(currency, i18n.language))}
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
                  value={formatAmountDisplay(derivedCreditLimit, groupingLocaleFor(currency, i18n.language))}
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
                value={formatAmountDisplay(creditUsedInitial, groupingLocaleFor(currency, i18n.language))}
                aria-label={t("accounts.form.creditUsedInitial")}
                onChange={(e) => setCreditUsedInitial(e.target.value.replace(/\D/g, ""))}
              />
            </Field>
          ) : null}

          <label className="mt-1 flex items-center gap-2">
            <Switch
              checked={status === "ACTIVE"}
              onCheckedChange={(checked) => setStatus(checked ? "ACTIVE" : "INACTIVE")}
              aria-label={t("accounts.form.accountActive")}
            />
            <span className="text-sm">{t("accounts.form.accountActive")}</span>
          </label>
        </div>

        <div className="flex flex-col gap-4">
          <SectionLabel>{t("accounts.form.preview")}</SectionLabel>
          <CardPreview
            brand={institutionName || t("accounts.title")}
            title={name}
            subtitle={t(`accounts.type.${type}`)}
            primary={balancePreview}
            footerLeft={currency}
            icon={ACCOUNT_ICON[type]}
          />
          {cardable ? (
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <SectionLabel>
                  {cards.length > 0 ? `${t("cards.title")} · ${cards.length}` : t("cards.title")}
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
              ) : null}

              {addingCard ? (
                <div className="flex flex-col gap-3 rounded-md border border-ring/60 p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold">{t("cards.newTitle")}</span>
                    <button
                      type="button"
                      onClick={() => setAddingCard(false)}
                      className="rounded-md p-1 text-muted-foreground hover:bg-muted"
                      aria-label={t("common.cancel")}
                    >
                      <X className="h-4 w-4" aria-hidden />
                    </button>
                  </div>
                  <CardForm
                    submitLabel={t("cards.add")}
                    accountCurrency={currency}
                    hasExistingPrimary={cards.some((c) => c.kind === "CREDIT")}
                    onSubmit={(card) => {
                      setCards((p) => [...p, card]);
                      setAddingCard(false);
                    }}
                  />
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      <div className="mt-6 flex items-center justify-between gap-4">
        <p className="text-xs text-muted-foreground">{t("accounts.form.editLaterHint")}</p>
        <div className="flex shrink-0 gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </Button>
          <Button onClick={submit} disabled={create.isPending || !name}>
            {t("accounts.form.createSubmit")}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
