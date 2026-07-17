import { CreditCard, X } from "lucide-react";
import { useTranslation } from "react-i18next";

import type { accounts } from "@finance/contracts";

import { cn } from "../../../shared/lib/cn";

// Deep, moody gradients (not light-to-bright) — a fixed "photograph" identity
// per card kind, same across both app themes (see --brand-deep/--debit-*/--prepaid-* in index.css).
const KIND_STYLE: Record<accounts.CardKind, string> = {
  CREDIT: "border border-primary/35 bg-[linear-gradient(150deg,hsl(var(--brand)),hsl(var(--brand-deep)))] text-credit-ink",
  DEBIT: "border border-accent/35 bg-[linear-gradient(150deg,hsl(var(--debit-from)),hsl(var(--debit-to)))] text-debit-ink",
  PREPAID: "border border-muted-foreground/30 bg-[linear-gradient(150deg,hsl(var(--prepaid-from)),hsl(var(--prepaid-to)))] text-prepaid-ink",
};

/** A locally-drafted (not yet saved) card, shown as a mini card-visual tile. */
export function DraftCardTile({
  card,
  onRemove,
}: Readonly<{
  card: accounts.CreateCard;
  onRemove: () => void;
}>) {
  const { t } = useTranslation();
  const expiry = `${String(card.expiryMonth).padStart(2, "0")}/${String(card.expiryYear).slice(-2)}`;

  return (
    <div
      className={cn(
        "flex aspect-[3/2] flex-col justify-between rounded-xl p-3",
        KIND_STYLE[card.kind],
      )}
    >
      <div className="flex items-start justify-between">
        <span className="text-xs font-medium opacity-90">{t(`cards.kind.${card.kind}`)}</span>
        <div className="flex items-center gap-1">
          <CreditCard className="h-4 w-4 opacity-80" aria-hidden />
          <button
            type="button"
            onClick={onRemove}
            aria-label={t("accounts.actions.delete")}
            className="rounded-full p-0.5 opacity-70 transition-opacity hover:bg-white/10 hover:opacity-100"
          >
            <X className="h-3.5 w-3.5" aria-hidden />
          </button>
        </div>
      </div>
      <div>
        <p className="text-lg font-semibold tracking-wide tabular-nums">•••• {card.last4}</p>
        <p className="mt-0.5 text-xs opacity-75 tabular-nums">{expiry}</p>
      </div>
    </div>
  );
}
