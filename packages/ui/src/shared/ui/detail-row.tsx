import { ChevronRight } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "../lib/cn";

interface BaseProps {
  label: ReactNode;
  /** Right-hand value. A dash-like placeholder is the caller's choice, not ours. */
  value?: ReactNode;
  /** Optional leading icon, aligned with the label. */
  icon?: ReactNode;
  className?: string;
  children?: ReactNode;
}

interface StaticProps extends BaseProps {
  onClick?: undefined;
}

interface InteractiveProps extends BaseProps {
  /** Turns the row into a button and reveals the chevron. */
  onClick: () => void;
  disabled?: boolean;
}

export type DetailRowProps = StaticProps | InteractiveProps;

const rowClass =
  "flex w-full items-center justify-between gap-4 border-b border-border py-3 text-sm last:border-b-0";

/**
 * Label on the left, value on the right — the row shape both the movement detail
 * panel and its form are built from. The interactive variant renders a real
 * button (so it is keyboard reachable) and shows a chevron.
 */
export function DetailRow(props: DetailRowProps) {
  const { label, value, icon, className, children } = props;

  const body = (
    <>
      <span className="flex items-center gap-2 text-muted-foreground">
        {icon}
        <span>{label}</span>
      </span>
      <span className="flex min-w-0 items-center gap-1.5 text-right font-medium text-foreground">
        {children ?? value}
        {"onClick" in props && props.onClick ? (
          <ChevronRight aria-hidden className="size-4 shrink-0 text-muted-foreground" />
        ) : null}
      </span>
    </>
  );

  if ("onClick" in props && props.onClick) {
    return (
      <button
        type="button"
        onClick={props.onClick}
        disabled={props.disabled}
        className={cn(
          rowClass,
          "text-left hover:bg-accent/5 disabled:cursor-not-allowed disabled:opacity-60",
          className,
        )}
      >
        {body}
      </button>
    );
  }

  return <div className={cn(rowClass, className)}>{body}</div>;
}
