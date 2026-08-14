import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import type { accounts } from "@finance/contracts";
import { addMoney, formatMoney, subtractMoney } from "@finance/money";

import { ApiRequestError } from "../../../shared/lib/apiClient";
import { DetailRow } from "../../../shared/ui/detail-row";
import { Field } from "../../../shared/ui/field";
import { Input } from "../../../shared/ui/input";
import { FormSurface } from "../../../shared/ui/overlay";
import { useCardMutations } from "../hooks/useCards";

/** `<input type="date">` wants the LOCAL day, not the UTC one. */
function todayLocalISO(): string {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

/**
 * Load ("recargar") a prepaid card from the account it hangs off.
 *
 * Two figures move in opposite directions and the panel shows both, because that
 * is the one thing about the prepaid model a user has to trust: the money leaves
 * the ACCOUNT (a real expense, which is why it also appears in Movimientos) and
 * lands on the CARD, where spending will draw it down afterwards.
 */
export function LoadPrepaidPanel({
  account,
  card,
  onOpenChange,
}: Readonly<{
  account: accounts.BankAccount;
  card: accounts.Card | null;
  onOpenChange: (v: boolean) => void;
}>) {
  const { t, i18n } = useTranslation();
  const { load } = useCardMutations(account.id);
  const [amount, setAmount] = useState("");
  const [occurredAt, setOccurredAt] = useState(todayLocalISO);

  // Reopening on another card must not inherit the previous figure.
  useEffect(() => {
    if (card) {
      setAmount("");
      setOccurredAt(todayLocalISO());
    }
  }, [card]);

  if (!card) return null;

  const fmt = (v: string) => formatMoney(v, { locale: i18n.language, currency: account.currency });
  const parsed = Number(amount);
  const valid = Number.isFinite(parsed) && parsed > 0;
  const cardAfter = valid ? addMoney(card.prepaidBalance ?? "0", amount) : null;
  const accountAfter = valid ? subtractMoney(account.currentBalance, amount) : null;

  return (
    <FormSurface
      open={card !== null}
      onOpenChange={onOpenChange}
      mode="create"
      surface="panel"
      eyebrow={t("cards.actions.load")}
      title={`${card.name} ·••• ${card.last4}`}
      description={t("cards.load.description")}
      submitLabel={t("cards.actions.load")}
      canSubmit={valid}
      submitting={load.isPending}
      onSubmit={() =>
        load.mutate(
          { cardId: card.id, body: { amount, occurredAt } },
          {
            onSuccess: () => {
              toast.success(t("cards.load.success"));
              onOpenChange(false);
            },
            onError: (e) =>
              toast.error(
                t(`errors.${e instanceof ApiRequestError ? e.code : "INTERNAL_ERROR"}`, {
                  defaultValue: t("errors.INTERNAL_ERROR"),
                }),
              ),
          },
        )
      }
    >
      <div className="flex flex-col gap-5">
        <Field label={t("cards.load.amount")}>
          <Input
            type="number"
            inputMode="decimal"
            min="0"
            step="0.01"
            className="h-12 text-2xl font-semibold tabular-nums"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </Field>

        <Field label={t("cards.load.date")}>
          <Input type="date" value={occurredAt} onChange={(e) => setOccurredAt(e.target.value)} />
        </Field>

        <div className="rounded-xl border border-border bg-muted/40">
          <DetailRow
            label={t("cards.detail.prepaidBalance")}
            value={fmt(card.prepaidBalance ?? "0")}
          />
          {cardAfter !== null ? (
            <DetailRow label={t("cards.load.cardAfter")} value={fmt(cardAfter)} />
          ) : null}
          <DetailRow label={t("cards.load.accountBalance")} value={fmt(account.currentBalance)} />
          {accountAfter !== null ? (
            <DetailRow label={t("cards.load.accountAfter")} value={fmt(accountAfter)} />
          ) : null}
        </div>

        <p className="text-xs text-muted-foreground">{t("cards.load.movementHint")}</p>
      </div>
    </FormSurface>
  );
}
