import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";

import type { accounts } from "@finance/contracts";

import { ActiveToggle } from "../../../shared/ui/active-toggle";
import { Button } from "../../../shared/ui/button";
import { SidePanel } from "../../../shared/ui/overlay";
import { AccountVisualCard } from "./AccountVisualCard";
import { type CardDraft, CardForm } from "./CardForm";

/** Ties the footer's submit button to the form it lives outside of. */
const FORM_ID = "card-form-panel";

/**
 * A card that doesn't exist yet, shaped so the tile can render it.
 *
 * The empty slots read as blanks WAITING to be filled ("XXXX", "MM/AA") rather
 * than as plausible values: dots would look like a real masked number and any
 * default date would look like a real expiry, so you couldn't tell what you had
 * already typed from what you hadn't.
 */
const BLANK_LAST4 = "XXXX";

const BLANK_CARD: accounts.Card = {
  id: "draft",
  name: "",
  kind: "CREDIT",
  last4: BLANK_LAST4,
  // Never displayed as-is — `expiryOverride` covers the tile while these are
  // untouched — but the type needs a pair, and these keep it a valid future date.
  expiryMonth: 12,
  expiryYear: 2099,
  isPrimary: false,
  isActive: true,
  limits: [],
  ownUsed: "0",
  prepaidBalance: null,
  prepaidInitialBalance: null,
};

/**
 * The panel a card is written in: tile on top, form below, actions pinned at the
 * bottom, with the tile as a LIVE preview that redraws as the kind, name, last 4
 * and limit are typed.
 *
 * Purely presentational — it hands the finished card back and knows nothing about
 * where it goes. That's what lets the SAME screen serve a card added to an
 * existing account (saved through the API) and one drafted while the account is
 * still being created (kept in local state until the account is submitted):
 * building a card should look identical either way, because it is the same job.
 */
export function CardFormPanel({
  open,
  onOpenChange,
  account,
  holder,
  hasExistingPrimary,
  initial,
  submitting = false,
  size,
  onSubmit,
}: Readonly<{
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** The account the card belongs to — real, or the draft being created. */
  account: accounts.BankAccount;
  /** Name printed on the tile, as in the detail surface. */
  holder?: string;
  hasExistingPrimary: boolean;
  initial?: accounts.Card;
  submitting?: boolean;
  /** `compact` when this panel is opened FROM another one (drafting a card while
   *  creating its account), so the one underneath stays visible behind it. On its
   *  own it takes the normal panel width. */
  size?: "default" | "compact";
  onSubmit: (card: accounts.CreateCard) => void;
}>) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<CardDraft | null>(null);
  // Owned here: the switch lives in the panel header, outside the form's DOM.
  const [isActive, setIsActive] = useState(initial?.isActive ?? true);
  // Stable identity: it's in the form's effect deps, and a new function every
  // render would re-report on every keystroke's re-render.
  const onDraftChange = useCallback((next: CardDraft) => setDraft(next), []);
  const editing = Boolean(initial);

  function close(next: boolean) {
    if (!next) {
      setDraft(null);
      setIsActive(initial?.isActive ?? true);
    }
    onOpenChange(next);
  }

  // Ignore an empty or zero amount: the tile would read "/ 0" mid-typing.
  const base = initial ?? BLANK_CARD;
  const draftLimit = draft?.limitAmount && Number(draft.limitAmount) > 0 ? draft.limitAmount : null;
  // A card's name is optional and this tile is the only place it shows, so an
  // unnamed draft would print an empty line where a value belongs. "Nueva
  // tarjeta" reads as the value it will be replaced by, not as a missing field.
  const previewName = draft?.name || initial?.name || t("cards.newTitle");
  // The tile can't express "no date yet" through a month/year pair, so the
  // placeholder is passed as text — only while BOTH parts are still untouched;
  // a half-typed date keeps showing whatever the form has resolved.
  const hasExpiry = Boolean(
    (draft?.expiryMonth ?? null) !== null && (draft?.expiryYear ?? null) !== null,
  );
  const expiryOverride = hasExpiry || initial ? undefined : t("cards.form.expiryPlaceholder");
  const previewCard: accounts.Card = {
    ...base,
    name: previewName,
    // The tile greys out the moment the switch flips — the preview must show what
    // saving would produce, and "inactive" is part of that.
    isActive,
    ...(draft
      ? {
          kind: draft.kind,
          last4: draft.last4 || BLANK_LAST4,
          expiryMonth: draft.expiryMonth ?? base.expiryMonth,
          expiryYear: draft.expiryYear ?? base.expiryYear,
          // The tile reads its limit off a `CardLimit` in the account's currency and
          // falls back to the account's pool, so previewing an amount means
          // synthesizing that row — the same thing saving does to the pool when this
          // is the primary card.
          limits:
            draftLimit === null
              ? base.limits
              : [
                  {
                    id: "draft",
                    currency: account.currency,
                    limitAmount: draftLimit,
                    used:
                      base.limits.find((l) => l.currency === account.currency)?.used ??
                      base.ownUsed,
                  },
                  ...base.limits.filter((l) => l.currency !== account.currency),
                ],
        }
      : {}),
  };

  return (
    <SidePanel
      open={open}
      onOpenChange={close}
      size={size}
      eyebrow={editing ? t("cards.editTitle") : t("cards.add")}
      title={draft?.name || initial?.name || t("cards.newTitle")}
      description={account.name || undefined}
      headerAside={
        <ActiveToggle
          checked={isActive}
          onCheckedChange={setIsActive}
          label={t("cards.form.active")}
          activeLabel={t("accounts.status.ACTIVE")}
          inactiveLabel={t("accounts.status.INACTIVE")}
        />
      }
      footer={
        // One form, one action bar: the form hides its own submit and this button
        // drives it through `form="<id>"`, exactly as the edit panel does.
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => close(false)} disabled={submitting}>
            {t("common.cancel")}
          </Button>
          <Button type="submit" form={FORM_ID} variant="accent" disabled={submitting}>
            {editing ? t("common.saveChanges") : t("cards.add")}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <AccountVisualCard
          account={account}
          card={previewCard}
          holder={holder}
          expiryOverride={expiryOverride}
          large
          className="mx-auto sm:max-w-sm"
        />
        <CardForm
          // Remounted per card (and per opening, via the host's own key), so a
          // cancelled draft never reappears half-filled.
          key={initial?.id ?? "new"}
          formId={FORM_ID}
          hideSubmit
          submitLabel={editing ? t("accounts.actions.save") : t("cards.add")}
          submitting={submitting}
          initial={initial}
          accountCurrency={account.currency}
          accountCreditLimit={account.creditLimit}
          hasExistingPrimary={hasExistingPrimary}
          onDraftChange={onDraftChange}
          isActive={isActive}
          onActiveChange={setIsActive}
          onSubmit={onSubmit}
        />
      </div>
    </SidePanel>
  );
}
