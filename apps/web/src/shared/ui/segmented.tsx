import { cn } from "../lib/cn";

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
}

interface SegmentedProps<T extends string> {
  value: T;
  onChange: (value: T) => void;
  options: SegmentedOption<T>[];
  "aria-label"?: string;
  className?: string;
}

/** Inline segmented switch (filters, tabs-like toggles). Tokens only. */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  className,
  ...rest
}: SegmentedProps<T>) {
  return (
    <div
      role="group"
      aria-label={rest["aria-label"]}
      className={cn("inline-flex rounded-md border bg-card p-0.5", className)}
    >
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          aria-pressed={value === opt.value}
          onClick={() => onChange(opt.value)}
          className={cn(
            "rounded-sm px-3 py-1.5 text-sm font-medium transition-colors",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            value === opt.value
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:bg-muted",
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
