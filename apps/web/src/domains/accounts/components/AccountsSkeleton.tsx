import { useTranslation } from "react-i18next";

import { Skeleton, SkeletonScreen } from "../../../shared/ui/skeleton";

/**
 * One placeholder tile. Nothing here is static: the badge is the account TYPE,
 * the heading its name, the footer label depends on whether it carries a credit
 * pool — all of it server-decided, so all of it a placeholder.
 */
function CardSkeleton({ withUsage }: Readonly<{ withUsage?: boolean }>) {
  return (
    <div className="flex flex-col rounded-xl border bg-card p-4 shadow-sm">
      <div className="mb-3.5 flex items-start justify-between">
        <Skeleton className="h-[34px] w-[34px] rounded-[9px]" />
        <Skeleton className="h-[18px] w-16 rounded-full" />
      </div>
      <Skeleton className="h-[13px] w-2/3" />
      <Skeleton className="mt-1.5 h-[10px] w-1/2" />
      <Skeleton className="mt-3 h-[19px] w-3/4" />
      {/* The usage footer only exists on accounts with a credit pool, so only
          some tiles carry it — a grid where every placeholder is identical reads
          as a table, not as the card wall it's about to become. */}
      {withUsage ? (
        <div className="mt-4 border-t pt-2.5">
          <div className="mb-1.5 flex items-center justify-between">
            <Skeleton className="h-[10px] w-20" />
            <Skeleton className="h-[10px] w-8" />
          </div>
          <Skeleton className="h-1.5 w-full rounded-full" />
          <Skeleton className="mt-2 h-[10px] w-32" />
        </div>
      ) : (
        <Skeleton className="mt-2 h-[10px] w-24" />
      )}
    </div>
  );
}

/** A group header (its title IS data — the currency/type/bank) with its tiles. */
function GroupSkeleton({ tiles }: Readonly<{ tiles: number }>) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <Skeleton className="h-[11px] w-28" />
        <span className="h-px flex-1 bg-border" />
        <Skeleton className="h-[12px] w-24" />
      </div>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(248px,1fr))] gap-3.5">
        {Array.from({ length: tiles }, (_, i) => (
          <CardSkeleton key={i} withUsage={i % 3 === 0} />
        ))}
      </div>
    </section>
  );
}

/**
 * Loading shape of the accounts list.
 *
 * Rule of the house: what the CLIENT already knows renders for real — here the
 * summary bar's own labels ("net worth", "assets", "card debt"), including the
 * user's primary currency, which comes from the session and not from this
 * request. Only the amounts and the grouped tiles are placeholders.
 *
 * The tile counts (4 + 2) are a plausible first paint — the real groups reflow
 * as soon as they land.
 */
export function AccountsSkeleton({
  label,
  primaryCurrency,
  /** The real filter row — static controls that work while the list loads. */
  controls,
}: Readonly<{ label: string; primaryCurrency: string; controls?: React.ReactNode }>) {
  const { t } = useTranslation();

  return (
    <SkeletonScreen label={label} className="flex flex-col gap-5">
      {/* Net-worth bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border bg-card px-4 py-5 sm:px-6">
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">
            {t("accounts.overview.netWorth")}{" "}
            <span className="text-dim">
              {t("accounts.overview.netWorthHint", { currency: primaryCurrency })}
            </span>
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-3">
            <Skeleton className="h-[30px] w-56" />
            <Skeleton className="h-[18px] w-20 rounded-full" />
            <Skeleton className="h-[18px] w-20 rounded-full" />
          </div>
        </div>
        <div className="flex flex-wrap gap-x-6 gap-y-2 sm:gap-8">
          <div className="flex flex-col items-end">
            <p className="text-[11.5px] text-muted-foreground">{t("accounts.overview.assets")}</p>
            <Skeleton className="mt-1.5 h-[16px] w-28" />
          </div>
          <div className="flex flex-col items-end">
            <p className="text-[11.5px] text-muted-foreground">{t("accounts.overview.cardDebt")}</p>
            <Skeleton className="mt-1.5 h-[16px] w-24" />
          </div>
        </div>
      </div>

      {controls}

      <GroupSkeleton tiles={4} />
      <GroupSkeleton tiles={2} />
    </SkeletonScreen>
  );
}
