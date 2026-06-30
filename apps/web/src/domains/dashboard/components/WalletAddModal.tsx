import { CreditCard, Plus, Wallet as WalletIcon } from "lucide-react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import type { accounts, wallet } from "@finance/contracts";

import { useAccounts } from "../../accounts/hooks/useAccounts";
import { Badge } from "../../../shared/ui/badge";
import { Button } from "../../../shared/ui/button";
import { Dialog } from "../../../shared/ui/dialog";
import { EmptyState } from "../../../shared/ui/states";
import { useWalletMutations } from "../hooks/useWallet";

type Candidate =
  | { key: string; kind: "card"; account: accounts.BankAccount; card: accounts.Card }
  | { key: string; kind: "account"; account: accounts.BankAccount };

export function WalletAddModal({
  open,
  onOpenChange,
  pinned,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  pinned: wallet.WalletItem[];
}) {
  const { t } = useTranslation();
  const { data: accountList } = useAccounts();
  const { add } = useWalletMutations();

  const candidates = useMemo<Candidate[]>(() => {
    const pinnedCards = new Set(pinned.map((p) => p.cardId).filter(Boolean));
    const pinnedAccounts = new Set(pinned.map((p) => p.accountId).filter(Boolean));
    const list: Candidate[] = [];
    for (const account of accountList ?? []) {
      for (const card of account.cards) {
        if (!pinnedCards.has(card.id))
          list.push({ key: `c:${card.id}`, kind: "card", account, card });
      }
      if (!pinnedAccounts.has(account.id))
        list.push({ key: `a:${account.id}`, kind: "account", account });
    }
    return list;
  }, [accountList, pinned]);

  function addItem(c: Candidate) {
    const body = c.kind === "card" ? { cardId: c.card.id } : { accountId: c.account.id };
    add.mutate(body, {
      onSuccess: () => toast.success(t("wallet.added")),
      onError: () => toast.error(t("errors.INTERNAL_ERROR")),
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={t("wallet.addTitle")}
      className="max-w-md"
    >
      {candidates.length === 0 ? (
        <EmptyState title={t("wallet.addEmpty")} />
      ) : (
        <ul className="flex max-h-[60vh] flex-col gap-2 overflow-y-auto">
          {candidates.map((c) => (
            <li
              key={c.key}
              className="flex items-center justify-between gap-3 rounded-md border px-3 py-2"
            >
              <span className="flex min-w-0 items-center gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                  {c.kind === "card" ? (
                    <CreditCard className="h-4 w-4" aria-hidden />
                  ) : (
                    <WalletIcon className="h-4 w-4" aria-hidden />
                  )}
                </span>
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-sm font-medium">{c.account.name}</span>
                  <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    {c.kind === "card" ? (
                      <>
                        <Badge variant="neutral">{t(`cards.kind.${c.card.kind}`)}</Badge>
                        ···· {c.card.last4}
                      </>
                    ) : (
                      <>
                        {t("wallet.accountItem")} · {c.account.currency}
                      </>
                    )}
                  </span>
                </span>
              </span>
              <Button
                size="sm"
                variant="outline"
                disabled={add.isPending}
                onClick={() => addItem(c)}
              >
                <Plus className="h-4 w-4" aria-hidden />
                {t("wallet.add")}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Dialog>
  );
}
