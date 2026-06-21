import { Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "../../../shared/ui/button";
import { PageHeader } from "../../../shared/ui/page-header";
import { Segmented } from "../../../shared/ui/segmented";
import { EmptyState, ErrorState, LoadingState } from "../../../shared/ui/states";
import { AccountCard } from "../components/AccountCard";
import { AccountCreateModal } from "../components/AccountCreateModal";
import { CurrencyTotals } from "../components/CurrencyTotals";
import { useAccounts } from "../hooks/useAccounts";

type StatusFilter = "all" | "active" | "inactive";

export function AccountsRoute() {
  const { t } = useTranslation();
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [modalOpen, setModalOpen] = useState(false);
  const { data, isLoading, isError } = useAccounts(
    filter === "all" ? undefined : { status: filter },
  );
  const list = data ?? [];

  const subtitle = useMemo(() => {
    const currencies = new Set(list.map((a) => a.currency)).size;
    return t("accounts.summary", { accounts: list.length, currencies });
  }, [list, t]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t("accounts.title")}
        description={list.length > 0 ? subtitle : undefined}
        actions={
          <Button onClick={() => setModalOpen(true)}>
            <Plus className="h-4 w-4" aria-hidden />
            {t("accounts.new")}
          </Button>
        }
      />

      <AccountCreateModal open={modalOpen} onOpenChange={setModalOpen} />

      {isLoading ? (
        <LoadingState title={t("app.loading")} />
      ) : isError ? (
        <ErrorState title={t("errors.INTERNAL_ERROR")} />
      ) : (
        <>
          <CurrencyTotals list={list} />

          <Segmented
            aria-label={t("accounts.filter.label")}
            value={filter}
            onChange={setFilter}
            options={[
              { value: "all", label: t("accounts.filter.all") },
              { value: "active", label: t("accounts.filter.active") },
              { value: "inactive", label: t("accounts.filter.inactive") },
            ]}
          />

          {list.length === 0 ? (
            <EmptyState title={t("accounts.empty")} />
          ) : (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(248px,1fr))] gap-4">
              {list.map((acc) => (
                <AccountCard key={acc.id} account={acc} />
              ))}
              <button
                type="button"
                onClick={() => setModalOpen(true)}
                className="flex min-h-[180px] flex-col items-center justify-center gap-2 rounded-xl border border-dashed text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
              >
                <Plus className="h-6 w-6" aria-hidden />
                <span className="text-sm font-medium">{t("accounts.new")}</span>
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
