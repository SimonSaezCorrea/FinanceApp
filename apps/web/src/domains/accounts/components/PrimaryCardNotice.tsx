import { AlertTriangle } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { accounts as accountsContract, type accounts } from "@finance/contracts";
import { Button } from "@finance/ui/src/shared/ui/button";

import { ReplacePrimaryPanel } from "./ReplacePrimaryPanel";

/**
 * Shown on a credit card account whose credit cards have no ACTIVE primary — data from before
 * spec 039, when the primary could be deactivated on its own. Without one the account can't be
 * billed, so the notice offers to choose one: an active card of the account, or a new card.
 * Renders nothing for every other account.
 */
export function PrimaryCardNotice({ account }: Readonly<{ account: accounts.BankAccount }>) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  if (!accountsContract.needsPrimaryCard(account)) return null;
  const inactivePrimary =
    account.cards.find((c) => c.kind === "CREDIT" && c.isPrimary && !c.isActive) ?? null;
  return (
    <div
      role="status"
      className="flex flex-col gap-2 rounded-lg border border-accent/40 bg-accent/10 p-3"
    >
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden />
        <div className="flex flex-col gap-0.5">
          <p className="text-sm font-medium">{t("accounts.primary.noticeTitle")}</p>
          <p className="text-xs text-muted-foreground">{t("accounts.primary.noticeBody")}</p>
        </div>
      </div>
      <Button variant="outline" size="sm" className="self-start" onClick={() => setOpen(true)}>
        {t("accounts.primary.noticeAction")}
      </Button>
      {open ? (
        <ReplacePrimaryPanel
          account={account}
          card={inactivePrimary}
          mode="CHOOSE"
          open
          onOpenChange={setOpen}
        />
      ) : null}
    </div>
  );
}
