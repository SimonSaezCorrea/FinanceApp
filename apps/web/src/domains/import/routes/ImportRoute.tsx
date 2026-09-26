import { ChevronRight } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import type { accounts } from "@finance/contracts";

import { cn } from "../../../shared/lib/cn";
import { PageHeader } from "../../../shared/ui/page-header";
import { EmptyState, ErrorState, LoadingState } from "../../../shared/ui/states";
import { accountMetaLine } from "../../accounts/lib/accountMeta";
import { ACCOUNT_ICON, isCreditType } from "../../accounts/components/accountVisuals";
import { useAccounts } from "../../accounts/hooks/useAccounts";
import { ImportMovementsPanel } from "../components/ImportMovementsPanel";

/**
 * The "Importar" section: a spreadsheet is always imported into ONE account, so
 * the page first asks which one, then opens the import panel for it. Only active
 * accounts are offered — an inactive one takes no new movements.
 */
export function ImportRoute() {
  const { t } = useTranslation();
  const query = useAccounts({ status: "active" });
  const [target, setTarget] = useState<accounts.BankAccount | null>(null);
  // Kept after closing so the panel's exit animation still has an account to render.
  const [open, setOpen] = useState(false);

  const list = query.isError ? [] : (query.data ?? []);
  const typeLabel = (type: accounts.AccountType) => t(`accounts.type.${type}`);

  function pick(account: accounts.BankAccount) {
    setTarget(account);
    setOpen(true);
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("import.title")} description={t("import.pageDescription")} />

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-muted-foreground">{t("import.pickAccount")}</h2>
        {query.isLoading ? (
          <LoadingState title={t("app.loading")} />
        ) : query.isError ? (
          <ErrorState inline error={query.error} onRetry={() => void query.refetch()} />
        ) : list.length === 0 ? (
          <EmptyState title={t("accounts.empty")} />
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {list.map((account) => {
              const Icon = ACCOUNT_ICON[account.type];
              const isCredit = isCreditType(account.type);
              return (
                <li key={account.id}>
                  <button
                    type="button"
                    onClick={() => pick(account)}
                    className={cn(
                      "group flex w-full items-center gap-3 rounded-xl border bg-card p-4 text-left shadow-sm transition-colors",
                      isCredit ? "hover:border-accent/60" : "hover:border-primary/40",
                    )}
                  >
                    <span
                      className={cn(
                        "flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[9px] bg-chip",
                        isCredit ? "text-accent" : "text-muted-foreground",
                      )}
                    >
                      <Icon className="h-[17px] w-[17px]" aria-hidden />
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-sm font-medium">{account.name}</span>
                      <span className="truncate text-xs text-muted-foreground">
                        {accountMetaLine(account, typeLabel)}
                      </span>
                    </span>
                    <ChevronRight
                      className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
                      aria-hidden
                    />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {target ? (
        <ImportMovementsPanel key={target.id} open={open} onOpenChange={setOpen} account={target} />
      ) : null}
    </div>
  );
}
