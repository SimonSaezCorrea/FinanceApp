import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import type { accounts } from "@finance/contracts";

import { ApiRequestError } from "../../../shared/lib/apiClient";
import { ResponsiveSurface } from "../../../shared/ui/overlay";
import { useCardMutations } from "../hooks/useCards";
import { CardForm } from "./CardForm";

/**
 * Add or edit a card without leaving the account view. Wraps CardForm in a
 * modal; offers the account's primary cards as parents for a secondary card.
 */
export function CardCreateModal({
  open,
  onOpenChange,
  accountId,
  accountCurrency,
  accountCreditLimit,
  hasExistingPrimary,
  initial,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  accountId: string;
  accountCurrency: string;
  accountCreditLimit?: string;
  hasExistingPrimary: boolean;
  initial?: accounts.Card;
}) {
  const { t } = useTranslation();
  const { add, update } = useCardMutations(accountId);
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
    <ResponsiveSurface
      open={open}
      onOpenChange={onOpenChange}
      title={editing ? t("cards.editTitle") : t("cards.add")}
      className="max-w-md"
    >
      <CardForm
        key={initial?.id ?? "new"}
        submitLabel={editing ? t("accounts.actions.save") : t("cards.add")}
        submitting={add.isPending || update.isPending}
        initial={initial}
        accountCurrency={accountCurrency}
        accountCreditLimit={accountCreditLimit}
        hasExistingPrimary={hasExistingPrimary}
        onSubmit={handle}
      />
    </ResponsiveSurface>
  );
}
