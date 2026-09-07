import { cn } from "../../lib/cn";

export interface FormChipOption<T extends string> {
  value: T;
  label: string;
  /** Classes applied only while this option is the active one (e.g. red for
   * "Debes", green for "Te deben") — a plain neutral pill otherwise. */
  activeClassName?: string;
}

interface Props<T extends string> {
  value: T;
  onChange: (value: T) => void;
  options: FormChipOption<T>[];
  "aria-label"?: string;
  className?: string;
}

/**
 * The compact rounded-full pill switch — visually distinct from `Segmented`
 * (a boxed, `rounded-md` filter bar): this is for a single yes/no-shaped
 * value INSIDE a form row (a debt's Debes/Te deben, a series' Activo/Pausado),
 * not a page-level filter. Same markup `DebtFormPanel`'s direction switch and
 * `RecurringFormPanel`'s status switch used to hand-roll.
 */
export function FormChip<T extends string>({
  value,
  onChange,
  options,
  className,
  ...rest
}: Readonly<Props<T>>) {
  return (
    <div
      role="group"
      aria-label={rest["aria-label"]}
      className={cn(
        "inline-flex items-center rounded-full border border-input bg-muted p-[2px] text-xs font-medium",
        className,
      )}
    >
      {options.map((opt) => {
        const active = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            aria-pressed={active}
            className={cn(
              "rounded-full px-2.5 py-1 transition-colors",
              active
                ? (opt.activeClassName ?? "bg-foreground text-background")
                : "text-muted-foreground",
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
