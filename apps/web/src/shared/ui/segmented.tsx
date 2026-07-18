import { cn } from "../lib/cn";

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  /** Overrides the variant's active pill classes for just this option (e.g. red/green per side). */
  activeClassName?: string;
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
}

/** Inline segmented switch (filters, tabs-like toggles). Tokens only. */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  className,
  variant = "primary",
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
            aria-pressed={active}
            onClick={() => onChange(opt.value)}
            className={cn(
              "flex-1 rounded-sm px-3 py-1.5 text-center text-sm transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              active ? activeClass : "font-medium text-muted-foreground hover:bg-muted",
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
