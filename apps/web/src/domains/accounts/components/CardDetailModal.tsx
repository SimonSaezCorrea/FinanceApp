import { Pencil, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";

import type { accounts } from "@finance/contracts";
import { formatMoney } from "@finance/money";

import { Button } from "../../../shared/ui/button";
import { Dialog } from "../../../shared/ui/dialog";
import { AccountVisualCard } from "./AccountVisualCard";

interface Props {
  account: accounts.BankAccount;
  card: accounts.Card | null;
  holder?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEdit: (card: accounts.Card) => void;
  onDelete: (card: accounts.Card) => void;
}

/** Enlarged, centered view of a single card — opened by clicking its tile in the sidebar. */
export function CardDetailModal({
  account,
  card,
  holder,
  open,
  onOpenChange,
  onEdit,
  onDelete,
}: Readonly<Props>) {
  const { t, i18n } = useTranslation();

  if (!card) return null;

  // Every OTHER currency this card carries its own CardLimit for — for the
  // primary, that's its extra currencies (its own-currency limit is already
  // shown by the tile above, mirrored from the account); for a non-primary
  // card, its "tope propio" in a currency other than the account's own.
  const extraPools = card.limits.filter((l) => l.currency !== account.currency);

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={card.name} className="max-w-sm">
      <div className="flex flex-col gap-4">
        <AccountVisualCard account={account} card={card} holder={holder} large />

        {extraPools.length > 0 ? (
          <div className="flex flex-col gap-1.5 rounded-md border p-3">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t("cards.form.extraLimits")}
            </span>
            {extraPools.map((l) => (
              <div key={l.currency} className="flex items-center justify-between text-sm">
                <span className="font-medium">{l.currency}</span>
                <span className="tabular-nums text-muted-foreground">
                  {formatMoney(l.used, { locale: i18n.language, currency: l.currency })}
                  {" / "}
                  {formatMoney(l.limitAmount, { locale: i18n.language, currency: l.currency })}
                </span>
              </div>
            ))}
          </div>
        ) : null}

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </Button>
          <Button
            variant="outline"
            className="text-destructive hover:bg-destructive/10"
            onClick={() => {
              onDelete(card);
              onOpenChange(false);
            }}
          >
            <Trash2 className="h-4 w-4" aria-hidden />
            {t("common.delete")}
          </Button>
          <Button
            onClick={() => {
              onEdit(card);
              onOpenChange(false);
            }}
          >
            <Pencil className="h-4 w-4" aria-hidden />
            {t("common.edit")}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
