import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import type { accounts } from "@finance/contracts";

import { ApiRequestError } from "../../../shared/lib/apiClient";
import { useCardMutations } from "../hooks/useCards";
import { CardFormPanel } from "./CardFormPanel";

/**
 * Add or edit a card of an EXISTING account: `CardFormPanel` plus the API call.
 *
 * The panel itself is shared with the account-creation flow, where the same
 * screen drafts a card into local state instead — so the only thing this file
 * owns is what happens to the card once it's written.
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
  const editing = Boolean(initial);

  function handle(card: accounts.CreateCard) {
    const handlers = {
      onSuccess: () => {
        toast.success(editing ? t("cards.updated") : t("cards.created"));
        onOpenChange(false);
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

  return (
    <CardFormPanel
      open={open}
      onOpenChange={onOpenChange}
      account={account}
      holder={holder}
      hasExistingPrimary={hasExistingPrimary}
      initial={initial}
      submitting={add.isPending || update.isPending}
      onSubmit={handle}
    />
  );
}
