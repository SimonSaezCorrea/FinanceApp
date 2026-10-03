import { AlertCircle, ChevronLeft, ChevronRight, CreditCard, Landmark, X } from "lucide-react";
import { type ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import type { accounts, wallet } from "@finance/contracts";
import { formatMoney } from "@finance/money";

import { ApiRequestError } from "../../../shared/lib/apiClient";
import { cn } from "../../../shared/lib/cn";
import { Button } from "../../../shared/ui/button";
import { FormSurface } from "../../../shared/ui/overlay";
import { AccountVisualCard } from "../../accounts/components/AccountVisualCard";
import { useAccounts } from "../../accounts/hooks/useAccounts";
import { MaskedAmount } from "../../profile/components/MaskedAmount";
import { useWalletMutations } from "../hooks/useWallet";
import {
  WALLET_MAX,
  accountKey,
  cardKey,
  draftFrom,
  duplicatedBalances,
  move,
  resolveKey,
  toReplaceBody,
  toggle,
  type WalletKey,
} from "../lib/walletDraft";

/**
 * "Arma tu cartera" — the whole wallet edited at once and saved with one
 * `PUT /wallet`. Left: every account with its cards hanging under it, each row
 * labelled Cuenta or Tarjeta (an account shows its balance or, on a credit card
 * account, the whole pool; a card shows that plastic). Right: the wallet as the
 * Panel will draw it — the same `AccountVisualCard` — with reorder and remove,
 * and a notice when a debit card repeats its own account's balance.
 */
export function WalletAddModal({
  open,
  onOpenChange,
  pinned,
  holder,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  pinned: wallet.WalletItem[];
  holder?: string;
}) {
  const { t, i18n } = useTranslation();
  const { data: accountList } = useAccounts({ status: "active" });
  const { replace } = useWalletMutations();
  const list = accountList ?? [];

  // The caller remounts this dialog each time it opens (`key`), so the draft
  // always starts from the saved wallet and a cancelled edit leaves nothing behind.
  const savedKey = draftFrom(pinned).join(",");
  const [draft, setDraft] = useState<WalletKey[]>(() => draftFrom(pinned));

  const dirty = draft.join(",") !== savedKey;
  const full = draft.length >= WALLET_MAX;
  const slots = Array.from({ length: WALLET_MAX }, (_, i) => draft[i] ?? null);
  const duplicates = duplicatedBalances(draft, list);

  function save() {
    replace.mutate(toReplaceBody(draft), {
      onSuccess: () => {
        toast.success(t("wallet.editor.saved"));
        onOpenChange(false);
      },
      onError: (err) => {
        const code = err instanceof ApiRequestError ? err.code : "INTERNAL_ERROR";
        toast.error(t(`errors.${code}`, { defaultValue: t("errors.INTERNAL_ERROR") }));
      },
    });
  }

  return (
    <FormSurface
      open={open}
      onOpenChange={onOpenChange}
      mode="edit"
      title={t("wallet.editor.title")}
      description={t("wallet.editor.description", { max: WALLET_MAX })}
      onSubmit={save}
      canSubmit={dirty}
      submitting={replace.isPending}
      dirty={dirty}
      className="sm:max-w-5xl"
    >
      <div className="flex flex-col gap-5 lg:flex-row">
        <ul className="scrollbar-thin flex max-h-[60vh] flex-col gap-2 overflow-y-auto lg:w-[22rem] lg:shrink-0">
          {list.map((account) => (
            <li key={account.id} className="shrink-0 overflow-hidden rounded-xl border">
              <PickRow
                selectedAt={draft.indexOf(accountKey(account.id))}
                disabled={full}
                onToggle={() => setDraft(toggle(draft, accountKey(account.id)))}
                icon={<Landmark className="h-4 w-4" aria-hidden />}
                title={account.name}
                meta={
                  <>
                    {t(`accounts.type.${account.type}`)} ·{" "}
                    <strong className="font-medium text-foreground/90">
                      <MaskedAmount>{balanceOf(account, i18n.language)}</MaskedAmount>
                    </strong>
                  </>
                }
                chip={t("wallet.editor.chipAccount")}
              />
              {account.cards.map((card) => (
                <PickRow
                  key={card.id}
                  nested
                  selectedAt={draft.indexOf(cardKey(card.id))}
                  disabled={full}
                  onToggle={() => setDraft(toggle(draft, cardKey(card.id)))}
                  icon={<CreditCard className="h-4 w-4" aria-hidden />}
                  title={
                    <>
                      <span className="font-mono">···· {card.last4}</span> ·{" "}
                      {t(`cards.kind.${card.kind}`)}
                      {card.kind === "CREDIT"
                        ? ` · ${t(card.isPrimary ? "wallet.editor.primary" : "wallet.editor.additional")}`
                        : ""}
                    </>
                  }
                  chip={t("wallet.editor.chipCard")}
                />
              ))}
            </li>
          ))}
        </ul>

        <div className="flex min-w-0 flex-1 flex-col gap-3 rounded-xl bg-muted/30 p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t("wallet.editor.preview")}
            </span>
            <span className="text-xs text-muted-foreground">
              {t("wallet.editor.count", { count: draft.length, max: WALLET_MAX })}
            </span>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {slots.map((key, index) => {
              const resolved = key ? resolveKey(key, list) : null;
              if (!key || !resolved) {
                return (
                  <div
                    key={`empty-${index}`}
                    className="flex h-[12.5rem] items-center justify-center rounded-2xl border border-dashed text-sm text-muted-foreground"
                  >
                    {t("wallet.editor.emptySlot", { n: index + 1 })}
                  </div>
                );
              }
              return (
                <div key={key} className="relative">
                  <AccountVisualCard
                    account={resolved.account}
                    card={resolved.card}
                    holder={holder}
                  />
                  <div className="absolute right-2 top-2 flex gap-1">
                    <SlotButton
                      label={t("wallet.editor.moveEarlier")}
                      disabled={index === 0}
                      onClick={() => setDraft(move(draft, key, -1))}
                    >
                      <ChevronLeft className="h-4 w-4" aria-hidden />
                    </SlotButton>
                    <SlotButton
                      label={t("wallet.editor.moveLater")}
                      disabled={index === draft.length - 1}
                      onClick={() => setDraft(move(draft, key, 1))}
                    >
                      <ChevronRight className="h-4 w-4" aria-hidden />
                    </SlotButton>
                    <SlotButton
                      label={t("wallet.remove")}
                      onClick={() => setDraft(draft.filter((k) => k !== key))}
                    >
                      <X className="h-4 w-4" aria-hidden />
                    </SlotButton>
                  </div>
                </div>
              );
            })}
          </div>
          {duplicates.map(({ card, account }) => (
            <div
              key={card.id}
              role="note"
              className="flex items-start gap-2.5 rounded-lg border border-accent/40 bg-accent/10 p-3 text-sm"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden />
              <span className="flex flex-col gap-2">
                <span>
                  {t("wallet.editor.duplicate", {
                    card: `···· ${card.last4}`,
                    account: account.name,
                  })}
                </span>
                <span>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setDraft(draft.filter((k) => k !== cardKey(card.id)))}
                  >
                    {t("wallet.editor.removeCard")}
                  </Button>
                </span>
              </span>
            </div>
          ))}
          <p className="text-xs text-muted-foreground">{t("wallet.editor.creditHint")}</p>
        </div>
      </div>
    </FormSurface>
  );
}

/** What an account row shows next to its type: the balance, or on a credit card
 * account the credit already used (as the negative it is on the Panel). */
function balanceOf(account: accounts.BankAccount, locale: string): string {
  if (account.type === "CREDIT_CARD") {
    return `−${formatMoney(account.creditUsed, { currency: account.currency, locale })}`;
  }
  return formatMoney(account.currentBalance, { currency: account.currency, locale });
}

function PickRow({
  selectedAt,
  disabled,
  onToggle,
  icon,
  title,
  meta,
  chip,
  nested = false,
}: {
  selectedAt: number;
  disabled: boolean;
  onToggle: () => void;
  icon: ReactNode;
  title: ReactNode;
  meta?: ReactNode;
  chip: string;
  nested?: boolean;
}) {
  const { t } = useTranslation();
  const selected = selectedAt >= 0;
  return (
    <button
      type="button"
      aria-pressed={selected}
      disabled={!selected && disabled}
      onClick={onToggle}
      className={cn(
        "flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        nested && "border-t py-2 pl-9",
        selected ? "bg-primary/10" : "hover:bg-muted/50",
      )}
    >
      <span
        className={cn(
          "flex shrink-0 items-center justify-center rounded-lg bg-chip text-muted-foreground",
          nested ? "h-7 w-7" : "h-8 w-8",
        )}
      >
        {icon}
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className={cn("truncate", nested ? "text-[13px]" : "text-sm font-medium")}>
          {title}
        </span>
        {meta ? <span className="truncate text-xs text-muted-foreground">{meta}</span> : null}
      </span>
      <span
        className={cn(
          "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold",
          selected ? "bg-primary text-primary-foreground" : "bg-chip text-muted-foreground",
        )}
      >
        {selected
          ? t("wallet.editor.inPanel", { n: selectedAt + 1 })
          : disabled
            ? t("wallet.editor.full")
            : chip}
      </span>
    </button>
  );
}

function SlotButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="flex h-8 w-8 items-center justify-center rounded-md bg-background/70 text-foreground backdrop-blur-sm transition-colors hover:bg-background/90 disabled:opacity-40"
    >
      {children}
    </button>
  );
}
