import { cn } from "../lib/cn";
import { Switch } from "./switch";

/**
 * "Is this record active?" as a header control, beside the title of whatever is
 * being edited — the account panel and the card panels all use this one, so the
 * switch reads the same everywhere instead of each surface inventing its own.
 *
 * A record's active state is a property OF the record, not one more field at the
 * bottom of its form; putting it at title level says so. It is still the form's
 * value: it saves with everything else, and toggling it marks the form dirty.
 *
 * The label collapses to screen-reader-only on a phone, where the header already
 * competes with the title and the close control.
 */
export function ActiveToggle({
  checked,
  onCheckedChange,
  label,
  activeLabel,
  inactiveLabel,
  className,
}: Readonly<{
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  /** Accessible name — says WHAT is being toggled ("Card active"). */
  label: string;
  /** Visible state text, e.g. "Active" / "Inactive". */
  activeLabel: string;
  inactiveLabel: string;
  className?: string;
}>) {
  return (
    <label className={cn("flex cursor-pointer items-center gap-2", className)}>
      <Switch checked={checked} onCheckedChange={onCheckedChange} aria-label={label} />
      <span className="whitespace-nowrap text-xs text-muted-foreground max-sm:sr-only">
        {checked ? activeLabel : inactiveLabel}
      </span>
    </label>
  );
}
