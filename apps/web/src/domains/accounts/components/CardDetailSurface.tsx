import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import type { accounts } from "@finance/contracts";

import { ApiRequestError } from "../../../shared/lib/apiClient";
import { useLastNonNull } from "../../../shared/lib/useLastNonNull";
import { useMediaQuery } from "../../../shared/lib/useMediaQuery";
import { Button } from "../../../shared/ui/button";
import { Drawer, SHEET_QUERY, Window } from "../../../shared/ui/overlay";
import { useCardMutations } from "../hooks/useCards";
import { AccountVisualCard } from "./AccountVisualCard";
import { CardDetailPanel } from "./CardDetailPanel";
import { type CardDraft, CardForm } from "./CardForm";

/** Ties the footer's submit button to the form it lives outside of. */
const FORM_ID = "card-edit-form";

interface Props {
  account: accounts.BankAccount;
  card: accounts.Card | null;
  holder?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDelete: (card: accounts.Card) => void;
}

/**
 * The card's detail/edit surface for the widths where the aside isn't available:
 * a right-side `Drawer` on a tablet (the list behind stays visible but out of
 * reach) and a full-screen `Window` on a phone. Desktop never mounts this — there
 * the same content expands inline inside the cards aside, so nothing about the
 * card is ever shown in two places at once.
 *
 * Detail and edit are ONE surface with two modes, not two stacked overlays:
 * "Editar" swaps the body in place and the header's eyebrow says which mode
 * you're in, mirroring the inline behaviour on desktop.
 */
export function CardDetailSurface({
  account,
  card,
  holder,
  open,
  onOpenChange,
  onDelete,
}: Readonly<Props>) {
  const { t } = useTranslation();
  const { update } = useCardMutations(account.id);
  const [editing, setEditing] = useState(false);
  // What the form currently holds, so the tile above it previews the edit as it's
  // typed instead of showing the saved card until you hit Guardar.
  const [draft, setDraft] = useState<CardDraft | null>(null);
  // Stable identity: it's in the form's effect deps, and a new function every
  // render would re-report on every keystroke's re-render too.
  const onDraftChange = useCallback((next: CardDraft) => setDraft(next), []);
  const isTablet = useMediaQuery(SHEET_QUERY);

  // Retained through the close: the parent clears `card` at the same time it
  // closes, and unmounting on that frame would cut the exit animation short.
  const retained = useLastNonNull(card);
  if (!retained) return null;
  // Re-bound after the guard: the hoisted function declarations below don't see
  // the narrowing of `retained` itself.
  const activeCard: accounts.Card = retained;

  function close(next: boolean) {
    if (!next) {
      setEditing(false);
      setDraft(null);
    }
    onOpenChange(next);
  }

  function save(body: accounts.CreateCard) {
    update.mutate(
      { cardId: activeCard.id, body },
      {
        onSuccess: () => {
          toast.success(t("cards.updated"));
          setEditing(false);
        },
        onError: (err: unknown) => {
          const code = err instanceof ApiRequestError ? err.code : "INTERNAL_ERROR";
          toast.error(t(`errors.${code}`, { defaultValue: t("errors.INTERNAL_ERROR") }));
        },
      },
    );
  }

  // Ignore an empty or zero amount: the tile would read "/ 0" mid-typing.
  const draftLimit =
    editing && draft?.limitAmount && Number(draft.limitAmount) > 0 ? draft.limitAmount : null;

  // Only the fields that are visible on the tile are previewed; a half-typed
  // expiry keeps the saved one rather than blanking the card.
  const previewCard: accounts.Card =
    editing && draft
      ? {
          ...activeCard,
          name: draft.name || activeCard.name,
          kind: draft.kind,
          last4: draft.last4 || activeCard.last4,
          expiryMonth: draft.expiryMonth ?? activeCard.expiryMonth,
          expiryYear: draft.expiryYear ?? activeCard.expiryYear,
          // The tile reads its limit off a `CardLimit` in the account's currency
          // and falls back to the account's pool, so previewing a new amount means
          // synthesizing that row — which is exactly what saving does to the pool
          // when this is the primary card. Other currencies' rows are untouched.
          limits:
            draftLimit === null
              ? activeCard.limits
              : [
                  {
                    id: "draft",
                    currency: account.currency,
                    limitAmount: draftLimit,
                    used:
                      activeCard.limits.find((l) => l.currency === account.currency)?.used ??
                      activeCard.ownUsed,
                  },
                  ...activeCard.limits.filter((l) => l.currency !== account.currency),
                ],
        }
      : activeCard;

  // The tile lives OUTSIDE the mode switch: rendered by each branch it ended up a
  // few pixels off between detail and edit (different siblings, different scroll
  // state), which read as the header shifting when you pressed Editar.
  const content = (
    <div className="flex flex-col gap-4">
      <AccountVisualCard
        account={account}
        card={previewCard}
        holder={holder}
        large
        className="mx-auto mt-2 sm:max-w-sm"
      />
      {editing ? (
        <CardForm
          key={activeCard.id}
          formId={FORM_ID}
          hideSubmit
          submitLabel={t("common.saveChanges")}
          submitting={update.isPending}
          initial={activeCard}
          accountCurrency={account.currency}
          accountCreditLimit={account.creditLimit}
          hasExistingPrimary={account.cards.some(
            (c) => c.kind === "CREDIT" && c.isPrimary && c.id !== activeCard.id,
          )}
          onDraftChange={onDraftChange}
          onSubmit={save}
        />
      ) : (
        <CardDetailPanel account={account} card={activeCard} holder={holder} />
      )}
    </div>
  );

  // Editing puts Cancelar and Guardar side by side in the surface's own action
  // bar; the form hides its internal submit and the footer's button drives it via
  // `form="<id>"`, so there's one action bar and one submit.
  const footer = editing ? (
    <div className="flex justify-end gap-2">
      <Button
        key="cancel"
        variant="outline"
        onClick={() => {
          setEditing(false);
          setDraft(null);
        }}
        disabled={update.isPending}
      >
        {t("common.cancel")}
      </Button>
      <Button key="save" type="submit" form={FORM_ID} variant="accent" disabled={update.isPending}>
        {t("common.saveChanges")}
      </Button>
    </div>
  ) : (
    <div className="flex items-center justify-between gap-2">
      <Button
        key="delete"
        variant="outline"
        className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
        onClick={() => onDelete(activeCard)}
      >
        {t("common.delete")}
      </Button>
      {/* Keyed apart from the edit footer's submit: without distinct keys React
          reuses this very DOM node for "Guardar", and the browser then applies the
          patched `type="submit"`/`form` to the click that is still in flight. */}
      <Button key="edit" variant="accent" onClick={() => setEditing(true)}>
        {t("cards.editTitle")}
      </Button>
    </div>
  );

  const shared = {
    open,
    onOpenChange: close,
    eyebrow: editing ? t("cards.editTitle") : t("cards.detail.title"),
    title: activeCard.name,
    // Same subtitle in both modes: the eyebrow already says which mode you're in,
    // and dropping the account name only made the header jump.
    description: account.name,
    footer,
    children: content,
  };

  return isTablet ? <Drawer {...shared} /> : <Window {...shared} />;
}
