import { Check } from "lucide-react";
import { type ReactNode, type Ref, useId } from "react";

import { cn } from "../../../shared/lib/cn";

interface Props {
  title: string;
  children: ReactNode;
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** Shown inside the card, which turns red — the consent is a field like any other. */
  error?: string | null;
  /** The checkbox itself, so a form can move focus to it when it's the first thing missing. */
  ref?: Ref<HTMLInputElement>;
}

/** An explicit consent as a card: a real checkbox (keyboard + screen reader) with its title and
 * the full text it stands for right next to it, so accepting reads as one deliberate act. The
 * checkbox is NAMED by the title and DESCRIBED by the full text, so a screen reader announces
 * what is being accepted, not just its heading. */
export function CheckCard({ title, children, checked, onChange, error, ref }: Readonly<Props>) {
  const id = useId();
  const titleId = `${id}-title`;
  const bodyId = `${id}-body`;
  const errorId = `${id}-error`;
  return (
    <label
      className={cn(
        "flex cursor-pointer items-start gap-3 rounded-xl border p-3.5 text-[13px] leading-relaxed text-muted-foreground transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring",
        error && "border-destructive bg-destructive/5",
        !error && (checked ? "border-primary bg-primary/5" : "border-input hover:border-border2"),
      )}
    >
      <input
        ref={ref}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        aria-labelledby={titleId}
        aria-describedby={error ? `${bodyId} ${errorId}` : bodyId}
        aria-invalid={error ? true : undefined}
        className="sr-only"
      />
      <span
        aria-hidden
        className={cn(
          "mt-0.5 grid size-5 shrink-0 place-items-center rounded-md border transition-colors",
          checked && "border-primary bg-primary text-primary-foreground",
          !checked && (error ? "border-destructive" : "border-input"),
        )}
      >
        {checked ? <Check className="size-3.5" strokeWidth={3} /> : null}
      </span>
      <span>
        <span id={titleId} className="block font-semibold text-foreground">
          {title}
        </span>
        <span id={bodyId}>{children}</span>
        {error ? (
          <span id={errorId} role="alert" className="mt-1.5 block text-xs text-destructive">
            {error}
          </span>
        ) : null}
      </span>
    </label>
  );
}
