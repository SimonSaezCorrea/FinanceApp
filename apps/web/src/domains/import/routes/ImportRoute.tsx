import { ChevronRight, Download, FileSpreadsheet, Upload } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import type { accounts } from "@finance/contracts";

import { toast } from "sonner";

import { cn } from "../../../shared/lib/cn";
import { Button } from "../../../shared/ui/button";
import { PageHeader } from "../../../shared/ui/page-header";
import { Skeleton, SkeletonScreen } from "../../../shared/ui/skeleton";
import { EmptyState, ErrorState } from "../../../shared/ui/states";
import { accountMetaLine } from "../../accounts/lib/accountMeta";
import { ACCOUNT_ICON, isCreditType } from "../../accounts/components/accountVisuals";
import { accountsApi } from "../../accounts/api/accountsApi";
import { useAccounts } from "../../accounts/hooks/useAccounts";
import { debtsApi } from "../../debts/api/debtsApi";
import { installmentsApi } from "../../installments/api/installmentsApi";
import { recurringApi } from "../../recurring/api/recurringApi";
import { savingsApi } from "../../savings/api/savingsApi";
import { transactionsApi } from "../../transactions/api/transactionsApi";
import { useAllowedCurrencies } from "../../reference/hooks/useAllowedCurrencies";
import { useCategories, useInstitutions } from "../../reference/hooks/useReference";
import { DownloadTemplateDialog, type TemplateContent } from "../components/DownloadTemplateDialog";
import { ImportMovementsPanel } from "../components/ImportMovementsPanel";
import { TemplateImportPanel } from "../components/TemplateImportPanel";
import { buildTemplate, type TemplateRefs } from "../lib/buildTemplate";
import { existingRows } from "../lib/templateData";

/**
 * The "Importar" section: a spreadsheet is always imported into ONE account, so
 * the page first asks which one, then opens the import panel for it. Only active
 * accounts are offered — an inactive one takes no new movements.
 *
 * Above it, the Cuadra template (specs/027): download a spreadsheet built with the
 * user's own accounts, cards and categories, fill it, upload it — for bringing a
 * whole personal spreadsheet (debts, instalments, goals…) in one go.
 */
export function ImportRoute() {
  const { t, i18n } = useTranslation();
  const query = useAccounts({ status: "active" });
  const [target, setTarget] = useState<accounts.BankAccount | null>(null);
  // Kept after closing so the panel's exit animation still has an account to render.
  const [open, setOpen] = useState(false);

  const list = useMemo(
    () => (query.isError ? [] : (query.data ?? [])),
    [query.isError, query.data],
  );
  const typeLabel = (type: accounts.AccountType) => t(`accounts.type.${type}`);

  const categories = useCategories();
  const institutions = useInstitutions("CL");
  const allowedCurrencies = useAllowedCurrencies();
  const [templateOpen, setTemplateOpen] = useState(false);
  const [downloadOpen, setDownloadOpen] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const refs = useMemo<TemplateRefs>(
    () => ({
      accounts: list.map((a) => ({ id: a.id, name: a.name, type: a.type, currency: a.currency })),
      cards: list.flatMap((a) =>
        (a.cards ?? []).map((c) => ({
          id: c.id,
          accountId: a.id,
          accountName: a.name,
          last4: c.last4,
        })),
      ),
      categories: categories.data ?? [],
      // The user's own currencies plus any an account already uses.
      currencies: [
        ...new Set([...allowedCurrencies.map((c) => c.code), ...list.map((a) => a.currency)]),
      ],
      institutions: (institutions.data ?? []).map((i) => ({ id: i.id, name: i.name })),
    }),
    [list, categories.data, allowedCurrencies, institutions.data],
  );

  /** Everything the user has, fetched only when a pre-filled template is asked for. */
  async function loadExisting() {
    const [allAccounts, txPage, debtList, plans, series, goals, entries] = await Promise.all([
      accountsApi.list(),
      transactionsApi.list(),
      debtsApi.list(),
      installmentsApi.list(),
      recurringApi.list(),
      savingsApi.listGoals(),
      savingsApi.listEntries(),
    ]);
    const statements = (
      await Promise.all(
        allAccounts
          .filter((a) => a.type === "CREDIT_CARD")
          .map((a) => accountsApi.creditStatements(a.id)),
      )
    ).flat();
    return existingRows(
      {
        statements,
        accounts: allAccounts,
        transactions: txPage.items,
        debts: debtList,
        plans,
        recurring: series,
        goals,
        entries,
        categories: categories.data ?? [],
      },
      t,
    );
  }

  async function download(content: TemplateContent) {
    setDownloading(true);
    try {
      const existing = content === "prefilled" ? await loadExisting() : undefined;
      const blob = await buildTemplate({ refs, t, locale: i18n.language, existing });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${t("import.template.cardTitle")}.xlsx`;
      link.click();
      URL.revokeObjectURL(url);
      setDownloadOpen(false);
    } catch {
      toast.error(t("import.template.downloadError"));
    } finally {
      setDownloading(false);
    }
  }

  function pick(account: accounts.BankAccount) {
    setTarget(account);
    setOpen(true);
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("import.title")} description={t("import.pageDescription")} />

      <section className="flex flex-col gap-4 rounded-xl border bg-card p-5 shadow-sm sm:flex-row sm:items-center">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-chip text-muted-foreground">
          <FileSpreadsheet className="h-5 w-5" aria-hidden />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h2 className="text-sm font-medium">{t("import.template.cardTitle")}</h2>
          <p className="text-sm text-muted-foreground">{t("import.template.cardDescription")}</p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={!query.data || !categories.data}
            onClick={() => setDownloadOpen(true)}
          >
            <Download className="h-4 w-4" aria-hidden />
            {t("import.template.download")}
          </Button>
          <Button
            variant="accent"
            size="sm"
            disabled={!query.data}
            onClick={() => setTemplateOpen(true)}
          >
            <Upload className="h-4 w-4" aria-hidden />
            {t("import.template.upload")}
          </Button>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-muted-foreground">{t("import.pickAccount")}</h2>
        {query.isLoading ? (
          <AccountGridSkeleton label={t("app.loading")} />
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

      <DownloadTemplateDialog
        open={downloadOpen}
        onOpenChange={setDownloadOpen}
        downloading={downloading}
        onDownload={(content) => void download(content)}
      />
      <TemplateImportPanel open={templateOpen} onOpenChange={setTemplateOpen} refs={refs} />

      {target ? (
        <ImportMovementsPanel key={target.id} open={open} onOpenChange={setOpen} account={target} />
      ) : null}
    </div>
  );
}

/** Loading shape of the account picker: the same grid and row height as the real buttons, so
 * the list lands without moving anything (icon tile, name, meta line, chevron). */
function AccountGridSkeleton({ label }: Readonly<{ label: string }>) {
  return (
    <SkeletonScreen label={label}>
      <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {["w-32", "w-40", "w-28", "w-36", "w-24", "w-44"].map((w) => (
          <li
            key={w}
            className="flex items-center gap-3 rounded-xl border bg-card p-4 shadow-sm"
            aria-hidden
          >
            <Skeleton className="h-[34px] w-[34px] shrink-0 rounded-[9px]" />
            <span className="flex min-w-0 flex-1 flex-col gap-1.5">
              <Skeleton className={cn("h-3.5", w)} />
              <Skeleton className="h-3 w-3/4" />
            </span>
            <Skeleton className="h-4 w-4 shrink-0 rounded-sm" />
          </li>
        ))}
      </ul>
    </SkeletonScreen>
  );
}
