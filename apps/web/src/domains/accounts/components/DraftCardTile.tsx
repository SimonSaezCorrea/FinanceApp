import { CreditCard, X } from "lucide-react";
import { useTranslation } from "react-i18next";

import type { accounts } from "@finance/contracts";

import { cn } from "../../../shared/lib/cn";
import { CARD_KIND_STYLE } from "./accountVisuals";

/** A locally-drafted (not yet saved) card, shown as a mini card-visual tile. */
export function DraftCardTile({
  card,
  isPrimary,
  onRemove,
}: Readonly<{
  card: accounts.CreateCard;
  /** Whether this drafted CREDIT card will become the account's primary (the
   * first CREDIT card submitted) — its limit becomes the account's own cupo. */
  isPrimary?: boolean;
  onRemove: () => void;
}>) {
  const { t } = useTranslation();
  const expiry = `${String(card.expiryMonth).padStart(2, "0")}/${String(card.expiryYear).slice(-2)}`;

  return (
    <div
      className={cn(
        "flex aspect-[3/2] flex-col justify-between rounded-xl p-3",
        CARD_KIND_STYLE[card.kind],
      )}
    >
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-medium opacity-90">{t(`cards.kind.${card.kind}`)}</span>
          {card.kind === "CREDIT" ? (
            <span className="rounded-full bg-[color-mix(in_srgb,currentColor_15%,transparent)] px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide">
              {isPrimary ? t("cards.primaryBadge") : t("cards.additionalBadge")}
            </span>
          ) : null}
        </div>
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
