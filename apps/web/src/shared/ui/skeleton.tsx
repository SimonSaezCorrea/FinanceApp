import { cn } from "../lib/cn";

/**
 * Placeholder block for content that hasn't arrived yet.
 *
 * A skeleton is only worth its complexity when it has the SHAPE of what replaces
 * it — same box sizes, same rhythm, same position. A generic spinner tells the
 * user "wait"; a skeleton tells them what they're waiting for, and the swap to
 * real content lands without the layout jumping.
 *
 * `aria-hidden` on purpose: the container announces the loading state once (see
 * `SkeletonScreen`), so every individual block staying silent is what keeps a
 * screen reader from hearing "loading" forty times.
 */
export function Skeleton({ className }: Readonly<{ className?: string }>) {
  return (
    <span
      aria-hidden
      className={cn("block rounded-md bg-muted motion-safe:animate-pulse", className)}
    />
  );
}

/**
 * Wrapper that announces a skeleton layout as a single loading region. Put the
 * shape inside; give it the label the user would read.
 */
export function SkeletonScreen({
  label,
  className,
  children,
}: Readonly<{ label: string; className?: string; children: React.ReactNode }>) {
  return (
    <div role="status" aria-busy="true" aria-live="polite" className={className}>
      <span className="sr-only">{label}</span>
      {children}
    </div>
  );
}
