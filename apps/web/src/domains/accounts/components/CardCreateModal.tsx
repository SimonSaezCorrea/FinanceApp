import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import type { accounts } from "@finance/contracts";

import { ApiRequestError } from "../../../shared/lib/apiClient";
import { ActiveToggle } from "../../../shared/ui/active-toggle";
import { Button } from "../../../shared/ui/button";
import { SidePanel } from "../../../shared/ui/overlay";
import { useCardMutations } from "../hooks/useCards";
import { AccountVisualCard } from "./AccountVisualCard";
import { type CardDraft, CardForm } from "./CardForm";

/** Ties the footer's submit button to the form it lives outside of. */
const FORM_ID = "card-create-form";

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
};

/**
 * Add or edit a card without leaving the account view.
 *
 * Uses the same `SidePanel` and the same layout as `CardDetailSurface`: the tile
 * on top, the form below, the actions pinned at the bottom. The tile is a LIVE
 * preview — it redraws as the kind, name, last 4 and limit are typed — so the
 * card is built while looking at the thing being built, and creating a card and
 * editing one are visibly the same screen.
 */
export function CardCreateModal({
  open,
  onOpenChange,
  account,
  holder,
  hasExistingPrimary,
  initial,
}: Readonly<{
  open: boolean;
  onOpenChange: (v: boolean) => void;
  account: accounts.BankAccount;
  /** Name printed on the tile, as in the detail surface. */
  holder?: string;
  hasExistingPrimary: boolean;
  initial?: accounts.Card;
}>) {
  const { t } = useTranslation();
  const { add, update } = useCardMutations(account.id);
  const [draft, setDraft] = useState<CardDraft | null>(null);
  // Owned here: the switch lives in the panel header, outside the form's DOM.
  const [isActive, setIsActive] = useState(initial?.isActive ?? true);
  // Stable identity: it's in the form's effect deps, and a new function every
  // render would re-report on every keystroke's re-render.
  const onDraftChange = useCallback((next: CardDraft) => setDraft(next), []);
  const editing = Boolean(initial);
  const submitting = add.isPending || update.isPending;

  function close(next: boolean) {
    if (!next) {
      setDraft(null);
      setIsActive(initial?.isActive ?? true);
    }
    onOpenChange(next);
  }

  function handle(card: accounts.CreateCard) {
    const handlers = {
      onSuccess: () => {
        toast.success(editing ? t("cards.updated") : t("cards.created"));
        close(false);
      },
      onError: (err: unknown) => {
        const code = err instanceof ApiRequestError ? err.code : "INTERNAL_ERROR";
        toast.error(t(`errors.${code}`, { defaultValue: t("errors.INTERNAL_ERROR") }));
      },
    };
    if (editing && initial) {
      update.mutate({ cardId: initial.id, body: card }, handlers);
    } else {
      add.mutate(card, handlers);
    }
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
      eyebrow={editing ? t("cards.editTitle") : t("cards.add")}
      title={draft?.name || initial?.name || t("cards.newTitle")}
      description={account.name}
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
          onSubmit={handle}
        />
      </div>
    </SidePanel>
  );
}
