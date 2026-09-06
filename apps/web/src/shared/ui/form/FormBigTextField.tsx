import { cn } from "../../lib/cn";

interface Props {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  id?: string;
  /** Accessible name — required since this field has no visible label of its
   * own (the big placeholder text plays that role visually). */
  "aria-label": string;
  /** "2xl" (default) matches a movement's/plan's title; "3xl" the heavier
   * weight a debt's/recurring's own name field uses. */
  size?: "2xl" | "3xl";
  className?: string;
}

const SIZE_CLASS: Record<"2xl" | "3xl", string> = {
  "2xl": "text-2xl font-semibold tracking-tight",
  "3xl": "text-[28px] font-semibold tracking-tight",
};

/**
 * The one big borderless input every create/edit sheet leads with — a
 * movement's description, a plan's title, a debt's concept, a recurring
 * series' name. No visible label: the placeholder IS the label here, the same
 * way a document's own title field never carries one beside it.
 */
export function FormBigTextField({
  value,
  onChange,
  placeholder,
  id,
  size = "2xl",
  className,
  "aria-label": ariaLabel,
}: Readonly<Props>) {
  return (
    <input
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      aria-label={ariaLabel}
      className={cn(
        "w-full border-0 bg-transparent p-0 text-foreground placeholder:text-muted-foreground focus-visible:outline-none",
        SIZE_CLASS[size],
        className,
      )}
    />
  );
}
