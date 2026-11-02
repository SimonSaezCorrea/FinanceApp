import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { accounts as accountsContract, type accounts } from "@finance/contracts";
import { ApiRequestError } from "@finance/client";
import { FormSurface } from "@finance/ui/src/shared/ui/overlay";

import { useIdempotencyKey } from "../../../shared/hooks/useIdempotencyKey";
import { FormSelectField, FormTextField } from "../../../shared/ui/form";
import { useCardMutations } from "../hooks/useCards";
import { cleanExpiryInput, parseExpiry } from "../lib/cardExpiry";

/** What the panel was opened to do with the primary card. */
export type ReplacePrimaryMode = "DEACTIVATE" | "DELETE" | "CHOOSE";

const NEW_CARD = "new";

/**
 * Names the card that becomes the account's primary (spec 039): when the primary is
 * deactivated or deleted — the account must always keep an ACTIVE one — or, in "CHOOSE" mode,
 * for an account whose primary was deactivated before that rule existed. The choice is
 * another active credit card of the account, or a new card typed here (the plastic the bank
 * just sent). The account's credit doesn't move: the new primary uses 100% of it.
 */
export function ReplacePrimaryPanel({
  account,
  card,
  mode,
  open,
  onOpenChange,
  onDone,
}: Readonly<{
  account: accounts.BankAccount;
  /** The current primary (active, or inactive in "CHOOSE" mode); null when the account has
   * credit cards but none is flagged primary at all. */
  card: accounts.Card | null;
  mode: ReplacePrimaryMode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone?: () => void;
}>) {
  const { t } = useTranslation();
  const { makePrimary, replacePrimary, add } = useCardMutations(account.id);
  const key = useIdempotencyKey();
  const candidates = account.cards.filter(
    (c) => c.kind === "CREDIT" && c.isActive && c.id !== card?.id,
  );
  const [choice, setChoice] = useState<string>(candidates[0]?.id ?? NEW_CARD);
  const [last4, setLast4] = useState("");
  const [expiry, setExpiry] = useState("");
  const [network, setNetwork] = useState<accounts.CardNetwork | "">(card?.network ?? "");
  const [touched, setTouched] = useState(false);

  const isNew = choice === NEW_CARD;
  const parsedExpiry = parseExpiry(expiry);
  const last4Error = isNew && touched && !/^\d{4}$/.test(last4) ? t("cards.errors.last4") : null;
  const expiryError = isNew && touched && !parsedExpiry ? t("cards.errors.expiry") : null;
  const valid = !isNew || (/^\d{4}$/.test(last4) && parsedExpiry !== null);
  const submitting = makePrimary.isPending || replacePrimary.isPending || add.isPending;

  const newCard = (): accounts.NewPrimaryCard => ({
    name: t("cards.kind.CREDIT"),
    last4,
    expiryMonth: parsedExpiry!.month,
    expiryYear: parsedExpiry!.year,
    isVirtual: false,
    isAdditional: false,
    network: network === "" ? null : network,
  });

  const done = () => {
    key.reset();
    toast.success(t("accounts.primary.changed"));
    onOpenChange(false);
    onDone?.();
  };
  const fail = (e: unknown) =>
    toast.error(
      t(`errors.${e instanceof ApiRequestError ? e.code : "INTERNAL_ERROR"}`, {
        defaultValue: t("errors.INTERNAL_ERROR"),
      }),
    );

  function submit() {
    setTouched(true);
    if (!valid) return;
    if (mode === "CHOOSE" && !isNew) {
      makePrimary.mutate(choice, { onSuccess: done, onError: fail });
      return;
    }
    if (!card) {
      // No card is flagged primary at all: the first credit card added becomes it.
      add.mutate(
        { ...newCard(), kind: "CREDIT", isActive: true, usesAccountPool: true },
        { onSuccess: done, onError: fail },
      );
      return;
    }
    replacePrimary.mutate(
      {
        cardId: card.id,
        body: {
          action: mode === "DELETE" ? "DELETE" : "DEACTIVATE",
          replacement: isNew ? { newCard: newCard() } : { cardId: choice },
        },
        idempotencyKey: key.current(),
      },
      { onSuccess: done, onError: fail },
    );
  }

  const description =
    mode === "DELETE"
      ? t("accounts.primary.deleteDescription")
      : mode === "CHOOSE"
        ? t("accounts.primary.chooseDescription")
        : t("accounts.primary.deactivateDescription");
  const submitLabel =
    mode === "DELETE"
      ? t("accounts.primary.confirmDelete")
      : mode === "CHOOSE"
        ? t("accounts.primary.confirmChoose")
        : t("accounts.primary.confirmDeactivate");

  return (
    <FormSurface
      open={open}
      onOpenChange={onOpenChange}
      mode="create"
      surface="panel"
      title={t("accounts.primary.title")}
      description={description}
      submitLabel={submitLabel}
      canSubmit={!submitting}
      submitting={submitting}
      onSubmit={submit}
    >
      <div className="flex flex-col gap-4">
        <fieldset className="flex flex-col gap-2">
          <legend className="sr-only">{t("accounts.primary.title")}</legend>
          {candidates.map((c) => (
            <label
              key={c.id}
              className="flex cursor-pointer items-center gap-3 rounded-lg border border-border px-3 py-2.5 has-[:checked]:border-primary has-[:checked]:bg-primary/5"
            >
              <input
                type="radio"
                name="primary-replacement"
                value={c.id}
                checked={choice === c.id}
                onChange={() => setChoice(c.id)}
                className="accent-primary"
              />
              <span className="flex flex-col">
                <span className="text-sm font-medium">{c.name}</span>
                <span className="text-xs text-muted-foreground">•••• {c.last4}</span>
              </span>
            </label>
          ))}
          <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-border px-3 py-2.5 has-[:checked]:border-primary has-[:checked]:bg-primary/5">
            <input
              type="radio"
              name="primary-replacement"
              value={NEW_CARD}
              checked={isNew}
              onChange={() => setChoice(NEW_CARD)}
              className="accent-primary"
            />
            <span className="flex flex-col">
              <span className="text-sm font-medium">{t("accounts.primary.newCard")}</span>
              <span className="text-xs text-muted-foreground">
                {candidates.length === 0
                  ? t("accounts.primary.noCandidates")
                  : t("accounts.primary.newCardHint")}
              </span>
            </span>
          </label>
        </fieldset>

        {isNew ? (
          <div className="flex flex-col">
            <FormTextField
              id="primary-last4"
              label={t("cards.form.last4")}
              value={last4}
              onChange={(v) => setLast4(v.replace(/\D/g, "").slice(0, 4))}
              placeholder="4821"
              autoFocus
            />
            {last4Error ? <p className="pt-1 text-xs text-destructive">{last4Error}</p> : null}
            <FormTextField
              id="primary-expiry"
              label={t("cards.form.expiry")}
              value={expiry}
              onChange={(v) => setExpiry(cleanExpiryInput(v))}
              placeholder="MM/AA"
            />
            {expiryError ? <p className="pt-1 text-xs text-destructive">{expiryError}</p> : null}
            <FormSelectField
              id="primary-network"
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
        ) : null}

        <p className="rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
          {t("accounts.primary.poolsUnchanged")}
        </p>
      </div>
    </FormSurface>
  );
}
