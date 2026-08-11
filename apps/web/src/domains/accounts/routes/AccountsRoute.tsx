import { Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { formatMoney } from "@finance/money";

import { convertApprox } from "../../../shared/lib/fx";
import { Button } from "../../../shared/ui/button";
import { PageHeader } from "../../../shared/ui/page-header";
import { Segmented } from "../../../shared/ui/segmented";
import { Skeleton } from "../../../shared/ui/skeleton";
import { EmptyState, ErrorState } from "../../../shared/ui/states";
import { AccountCard } from "../components/AccountCard";
import { AccountCreateModal } from "../components/AccountCreateModal";
import { AccountsSkeleton } from "../components/AccountsSkeleton";
import { AccountsSummary } from "../components/AccountsSummary";
import { GroupByMenu } from "../components/GroupByMenu";
import { useAuth } from "../../auth/hooks/useAuth";
import { useAccounts } from "../hooks/useAccounts";
import { type GroupBy, groupAccounts } from "../lib/grouping";

type StatusFilter = "all" | "active" | "inactive";

export function AccountsRoute() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const primaryCurrency = user?.preferredCurrency ?? "CLP";
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [groupBy, setGroupBy] = useState<GroupBy>("currency");
  const [modalOpen, setModalOpen] = useState(false);
  const { data, isLoading, isError } = useAccounts(
    filter === "all" ? undefined : { status: filter },
  );
  const list = useMemo(() => data ?? [], [data]);

  const subtitle = useMemo(() => {
    const currencies = new Set(list.map((a) => a.currency)).size;
    return t("accounts.summary", { accounts: list.length, currencies });
  }, [list, t]);
  const subtitleOrNothing = list.length > 0 ? subtitle : undefined;

  const groups = useMemo(
    () =>
      groupAccounts(list, groupBy, {
        primaryCurrency,
        type: (type) => t(`accounts.type.${type}`),
        status: (status) => t(`accounts.status.${status}`),
        noInstitution: t("accounts.groupBy.noInstitution"),
        ungrouped: t("accounts.groupBy.allAccounts", { count: list.length }),
      }),
    [list, groupBy, primaryCurrency, t],
  );

  /** Group total, plus its "≈ in my currency" hint when the group is foreign-only. */
  const groupTotal = (totals: { currency: string; total: string }[]) => {
    const money = (value: string, currency: string) =>
      formatMoney(value, { locale: i18n.language, currency });
    const native = totals.map((x) => money(x.total, x.currency)).join(" · ");
    const approx =
      totals.length === 1 && totals[0] && totals[0].currency !== primaryCurrency
        ? convertApprox(totals[0].total, totals[0].currency, primaryCurrency)
        : null;
    return { native, approx: approx === null ? null : money(approx, primaryCurrency) };
  };

  // Rendered by both the loaded view and the skeleton: these controls are client
  // state, so hiding them while the list loads would be hiding something we have.
  const filterRow = (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <Segmented
        size="sm"
        // Compact and left-aligned: it's a secondary filter, not a full-width control.
        className="self-start"
        aria-label={t("accounts.filter.label")}
        value={filter}
        onChange={setFilter}
        options={[
          { value: "all", label: t("accounts.filter.all") },
          { value: "active", label: t("accounts.filter.active") },
          { value: "inactive", label: t("accounts.filter.inactive") },
        ]}
      />
      {/* Grouping only means something once there are accounts to group. */}
      {isLoading || list.length > 0 ? <GroupByMenu value={groupBy} onChange={setGroupBy} /> : null}
    </div>
  );

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title={t("accounts.title")}
        description={
          // Reserved while loading: without it the header grows a line the moment
          // the count arrives and pushes the whole page down.
          isLoading ? <Skeleton className="mt-1.5 h-[13px] w-40" /> : subtitleOrNothing
        }
        actions={
          <Button variant="accent" onClick={() => setModalOpen(true)}>
            <Plus className="h-4 w-4" aria-hidden />
            {t("accounts.new")}
          </Button>
        }
      />

      <AccountCreateModal open={modalOpen} onOpenChange={setModalOpen} />

      {isLoading ? (
        <AccountsSkeleton
          label={t("app.loading")}
          primaryCurrency={primaryCurrency}
          // The filters are ours, not the server's: they stay live while the list
          // loads (switching one just re-runs the query behind the same skeleton).
          controls={filterRow}
        />
      ) : isError ? (
        <ErrorState title={t("errors.INTERNAL_ERROR")} />
      ) : (
        <>
          <AccountsSummary list={list} primaryCurrency={primaryCurrency} />

          {filterRow}

          {list.length === 0 ? (
            <EmptyState title={t("accounts.empty")} />
          ) : (
            groups.map((group) => {
              const total = groupTotal(group.totals);
              return (
                <section key={group.key} className="flex flex-col gap-3">
                  <div className="flex items-center gap-3">
                    <h2 className="text-[11px] font-semibold uppercase tracking-[0.09em] text-dim">
                      {group.title}
                      <span className="ml-2 font-normal normal-case tracking-normal">
                        {t("accounts.groupBy.count", { count: group.accounts.length })}
                      </span>
                    </h2>
                    <span className="h-px flex-1 bg-border" />
                    {/* A multi-currency group lists one total per currency (no summing across). */}
                    <span className="text-[12.5px] font-semibold tabular-nums">
                      {total.native}
                      {total.approx ? (
                        <span className="font-normal text-dim"> ≈ {total.approx}</span>
                      ) : null}
                    </span>
                  </div>
                  <div className="grid grid-cols-[repeat(auto-fill,minmax(248px,1fr))] gap-3.5">
                    {group.accounts.map((acc) => (
                      <AccountCard key={acc.id} account={acc} primaryCurrency={primaryCurrency} />
                    ))}
                  </div>
                </section>
              );
            })
          )}
        </>
      )}
    </div>
  );
}
