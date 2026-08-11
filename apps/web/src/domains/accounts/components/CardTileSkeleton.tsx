import { cn } from "../../../shared/lib/cn";
import { Skeleton } from "../../../shared/ui/skeleton";

/**
 * Placeholder for an `AccountVisualCard` tile — the ONE shape used everywhere a
 * card tile is still loading: the dashboard wallet, the account detail's cards
 * aside and the card detail surface. Kept in a single component because three
 * copies of "a card-shaped skeleton" drift apart at the first tweak.
 *
 * It draws the tile's actual anatomy (issuer line, kind badge, the number, holder
 * and expiry) rather than one flat block: at this size a plain rectangle reads as
 * a missing image, while the inner bars read as a card that hasn't filled in yet.
 *
 * `large` matches the surface's own tile (`AccountVisualCard large`), which locks
 * a card aspect ratio instead of sizing to its content.
 */
export function CardTileSkeleton({
  large,
  className,
}: Readonly<{ large?: boolean; className?: string }>) {
  return (
    <div
      className={cn(
        "flex flex-col justify-between rounded-2xl border bg-card p-4",
        large ? "aspect-[1.6] w-full" : "h-[12.5rem]",
        className,
      )}
    >
      <div className="flex items-start justify-between">
        <Skeleton className="h-[12px] w-24" />
        <Skeleton className="h-[16px] w-16 rounded-full" />
      </div>
      <Skeleton className="h-[20px] w-40" />
      <div className="flex items-center justify-between">
        <Skeleton className="h-[11px] w-28" />
        <Skeleton className="h-[11px] w-12" />
      </div>
    </div>
  );
}
