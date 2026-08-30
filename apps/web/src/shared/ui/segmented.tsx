import { cn } from "../lib/cn";

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  /** Overrides the variant's active pill classes for just this option (e.g. red/green per side). */
  activeClassName?: string;
  /** Renders this option greyed-out and non-interactive (e.g. a not-yet-available choice). */
  disabled?: boolean;
  /** Tooltip/aria text shown on a disabled option, explaining why it can't be picked. */
  disabledReason?: string;
}

interface SegmentedProps<T extends string> {
  value: T;
  onChange: (value: T) => void;
  options: SegmentedOption<T>[];
  "aria-label"?: string;
  className?: string;
  /** "primary" (default): active pill in the brand color. "neutral": active pill is a
   * subtle raised surface with bold foreground text, no brand color. */
  variant?: "primary" | "neutral";
  /** "md" (default) or "sm" — a compact switch for secondary controls (e.g. list filters). */
  size?: "sm" | "md";
}

const SIZE_CLASS: Record<"sm" | "md", string> = {
  sm: "px-2.5 py-1 text-xs",
  md: "px-3 py-1.5 text-sm",
};

/** Inline segmented switch (filters, tabs-like toggles). Tokens only. */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  className,
  variant = "primary",
  size = "md",
  ...rest
}: SegmentedProps<T>) {
  return (
    <div
      role="group"
      aria-label={rest["aria-label"]}
      className={cn("inline-flex rounded-md border bg-card p-0.5", className)}
    >
      {options.map((opt) => {
        const active = value === opt.value;
        const activeClass =
          opt.activeClassName ??
          (variant === "neutral"
            ? "bg-secondary font-semibold text-foreground"
            : "bg-primary font-medium text-primary-foreground");
        return (
          <button
            key={opt.value}
            type="button"
            disabled={opt.disabled}
            aria-pressed={active}
            title={opt.disabled ? opt.disabledReason : undefined}
            onClick={() => onChange(opt.value)}
            className={cn(
              // `flex-1` makes every segment the same width; without nowrap the longest
              // label ("Por vencer") wraps to two lines and the whole switch grows to
              // two rows. A segment label is a short phrase — it never wraps.
              // `flex items-center justify-center`: the root's default cross-axis
              // `stretch` already grows a button to a caller-set root height (e.g.
              // pairing this control with a same-row `Input`); without its own flex
              // centering the label stays pinned to its unstretched line-height
              // instead of sitting in the middle of that taller box.
              "flex flex-1 items-center justify-center whitespace-nowrap rounded-sm text-center transition-colors",
              SIZE_CLASS[size],
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              "disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent",
              !opt.disabled &&
                (active ? activeClass : "font-medium text-muted-foreground hover:bg-muted"),
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
