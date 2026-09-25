import { Check } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "../../../shared/lib/cn";

interface Props {
  title: string;
  children: ReactNode;
  checked: boolean;
  onChange: (checked: boolean) => void;
}

/** An explicit consent as a card: a real checkbox (keyboard + screen reader) with its title and
 * the full text it stands for right next to it, so accepting reads as one deliberate act. */
export function CheckCard({ title, children, checked, onChange }: Readonly<Props>) {
  return (
    <label
      className={cn(
        "flex cursor-pointer items-start gap-3 rounded-xl border p-3.5 text-[13px] leading-relaxed text-muted-foreground transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring",
        checked ? "border-primary bg-primary/5" : "border-input hover:border-border2",
      )}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        aria-label={title}
        className="sr-only"
      />
      <span
        aria-hidden
        className={cn(
          "mt-0.5 grid size-5 shrink-0 place-items-center rounded-md border transition-colors",
          checked ? "border-primary bg-primary text-primary-foreground" : "border-input",
        )}
      >
        {checked ? <Check className="size-3.5" strokeWidth={3} /> : null}
      </span>
      <span>
        <span className="block font-semibold text-foreground">{title}</span>
        {children}
      </span>
    </label>
  );
}
