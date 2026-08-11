import { ChevronRight, Pencil, Plus, Power, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";

import { cn } from "../../../shared/lib/cn";
import { useElementWidth } from "../../../shared/lib/useElementWidth";
import { Button } from "../../../shared/ui/button";
import { Card } from "../../../shared/ui/card";
import { Skeleton, SkeletonScreen } from "../../../shared/ui/skeleton";
import { Table, TD, TH, THead, TR } from "../../../shared/ui/table";
import { CardTileSkeleton } from "./CardTileSkeleton";
import { FULL_TABLE_MIN_WIDTH } from "../../transactions/components/TransactionTable";

/** KPI tile. Which ones exist (balance / change / credit) depends on the account
 *  type, so even the labels are unknown until the account lands. */
function KpiSkeleton() {
  return (
    <Card className="flex flex-col gap-2 p-4">
      <Skeleton className="h-[12px] w-24" />
      <Skeleton className="h-[24px] w-36" />
    </Card>
  );
}

/** Compact-list row, for the narrow layout where the real table drops its columns. */
function MovementRowSkeleton() {
  return (
    <div className="flex items-center gap-3 border-b px-4 py-3 last:border-b-0">
      <Skeleton className="h-8 w-8 shrink-0 rounded-full" />
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <Skeleton className="h-[13px] w-2/5" />
        <Skeleton className="h-[11px] w-1/4" />
      </div>
      <Skeleton className="hidden h-[11px] w-20 shrink-0 sm:block" />
      <Skeleton className="h-[13px] w-24 shrink-0" />
    </div>
  );
}

/**
 * The movements table on its own — also used when only the list reloads (e.g.
 * after switching the card filter), where the rest of the view already stands.
 *
 * It measures itself and splits at the SAME width as `TransactionTable`, so the
 * placeholder and the real table always agree on which of the two shapes is on
 * screen. Where the columns fit, the headings render for real: they're ours and
 * fixed. "Tarjeta" is the one column left out — the real table only shows it when
 * the visible rows use more than one card, which is a property of the data.
 */
export function MovementsTableSkeleton({ rows = 6 }: Readonly<{ rows?: number }>) {
  const { t } = useTranslation();
  const [containerRef, width] = useElementWidth();
  // Same fallback as the real table: the compact list works at any width.
  const wide = width !== null && width >= FULL_TABLE_MIN_WIDTH;

  return (
    <Card ref={containerRef} className="overflow-hidden p-0" aria-busy="true">
      <div className={wide ? "block" : "hidden"}>
        <Table>
          <THead className="bg-muted/50">
            <TR>
              <TH className="w-8" />
              <TH>{t("transactions.form.description")}</TH>
              <TH>{t("transactions.form.category")}</TH>
              <TH>{t("transactions.form.type")}</TH>
              <TH className="whitespace-nowrap">{t("transactions.form.date")}</TH>
              <TH numeric>{t("transactions.form.amount")}</TH>
              <TH className="w-20" />
            </TR>
          </THead>
          <tbody>
            {Array.from({ length: rows }, (_, i) => (
              <TR key={i}>
                <TD>
                  <Skeleton className="h-8 w-8 rounded-full" />
                </TD>
                <TD>
                  <Skeleton className="h-[13px] w-40" />
                </TD>
                <TD>
                  <Skeleton className="h-[13px] w-24" />
                </TD>
                <TD>
                  <Skeleton className="h-[20px] w-16 rounded-full" />
                </TD>
                <TD>
                  <Skeleton className="h-[13px] w-24" />
                </TD>
                <TD numeric>
                  <Skeleton className="ml-auto h-[13px] w-24" />
                </TD>
                <TD>
                  <Skeleton className="h-[13px] w-12" />
                </TD>
              </TR>
            ))}
          </tbody>
        </Table>
      </div>

      <div className={wide ? "hidden" : "block"}>
        {Array.from({ length: rows }, (_, i) => (
          <MovementRowSkeleton key={i} />
        ))}
      </div>
    </Card>
  );
}

/**
 * Loading shape of the account detail.
 *
 * Same rule as the other skeletons: what the client already knows renders for
 * real — the breadcrumb back to "Accounts", the action labels (disabled until
 * there's an account to act on), the "New movement" and "Add card" buttons, the
 * "Cards" heading. Everything the response decides — the account's name, type,
 * status badge, which KPIs exist, which tabs exist, the rows and the cards — is a
 * placeholder.
 *
 * `isDesktop` mirrors the route's own measured layout so the loading state and
 * the loaded one agree on whether there's a side column.
 */
export function AccountDetailSkeleton({
  label,
  isDesktop,
}: Readonly<{ label: string; isDesktop: boolean }>) {
  const { t } = useTranslation();

  return (
    <SkeletonScreen label={label} className="flex flex-col gap-4">
      <nav className="flex shrink-0 items-center gap-1 text-sm text-muted-foreground">
        <Link to="/accounts" className="hover:text-foreground">
          {t("accounts.title")}
        </Link>
        <ChevronRight className="h-4 w-4" aria-hidden />
        <Skeleton className="h-[14px] w-32" />
      </nav>

      <div
        className={cn(
          "grid gap-6",
          isDesktop && "min-h-0 flex-1 grid-cols-[1fr_clamp(320px,24vw,480px)]",
        )}
      >
        <div className={cn("flex min-w-0 flex-col gap-6", isDesktop && "min-h-0")}>
          {/* Header */}
          <div className="flex shrink-0 flex-col gap-3 lg:flex-row lg:items-start lg:justify-between lg:gap-4">
            <div className="flex min-w-0 items-center gap-3">
              <Skeleton className="h-12 w-12 shrink-0 rounded-xl" />
              <div className="flex min-w-0 flex-col gap-2">
                <div className="flex items-center gap-2">
                  <Skeleton className="h-[24px] w-48" />
                  <Skeleton className="h-[20px] w-16 rounded-full" />
                </div>
                <Skeleton className="h-[13px] w-56" />
              </div>
            </div>
            {/* The actions are ours, so they read normally — disabled because
                there's nothing to act on yet. The status toggle shows its ACTIVE
                label ("deactivate"), which is what the overwhelming majority of
                accounts are; on an inactive one it flips to "activate" when the
                data lands, and the button keeps its place either way. */}
            <div className="flex flex-wrap items-center gap-1.5 lg:shrink-0 lg:justify-end">
              <Button variant="secondary" size="sm" disabled>
                <Pencil className="h-4 w-4" aria-hidden />
                {t("accounts.actions.edit")}
              </Button>
              <span className="mx-1 h-5 w-px bg-border" aria-hidden />
              <Button variant="ghost" size="sm" disabled className="text-warning">
                <Power className="h-4 w-4" aria-hidden />
                {t("accounts.actions.deactivate")}
              </Button>
              <Button variant="ghost" size="sm" disabled className="text-destructive">
                <Trash2 className="h-4 w-4" aria-hidden />
                {t("accounts.actions.delete")}
              </Button>
            </div>
          </div>

          {/* KPIs — how many there are depends on the account type. */}
          <div className="grid gap-3 sm:grid-cols-2">
            <KpiSkeleton />
            <KpiSkeleton />
          </div>

          {/* "Movements" is constant — always present, always the tab we open on,
              so it renders for real and already underlined. What follows it is
              not: "Billing" only exists on an account with a credit pool, and
              "Cards" only on the narrow layout of a cardable one. Hence one real
              tab plus one placeholder holding the strip's width. */}
          <div role="tablist" className="flex gap-4 border-b">
            <span
              role="tab"
              aria-selected="true"
              className="-mb-px border-b-2 border-primary px-1 py-2 text-sm font-medium text-foreground"
            >
              {t("transactions.title")}
            </span>
            <span className="flex items-center px-1 py-2">
              <Skeleton className="h-[14px] w-20" />
            </span>
          </div>

          {/* Movements */}
          <div className={cn("flex flex-col gap-3", isDesktop && "min-h-0 flex-1")}>
            <div className="flex items-center justify-between gap-3">
              <Skeleton className="h-9 w-48 rounded-md" />
              <Button variant="accent" size="sm" disabled>
                <Plus className="h-4 w-4" aria-hidden />
                {t("transactions.new")}
              </Button>
            </div>
            <MovementsTableSkeleton />
          </div>
        </div>

        {isDesktop ? (
          <aside className="flex min-h-0 flex-col gap-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold">{t("cards.title")}</span>
              <Button variant="outline" size="sm" disabled>
                <Plus className="h-3.5 w-3.5" aria-hidden />
                {t("cards.add")}
              </Button>
            </div>
            <div className="flex flex-col gap-3">
              <CardTileSkeleton />
              <CardTileSkeleton />
            </div>
          </aside>
        ) : null}
      </div>
    </SkeletonScreen>
  );
}
