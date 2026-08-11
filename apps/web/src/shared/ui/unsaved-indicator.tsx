import { useTranslation } from "react-i18next";

import { cn } from "../lib/cn";

/**
 * "Sin guardar" marker for a form with pending edits: a softly pulsing dot plus
 * the label. Renders nothing when there is nothing pending, so it can be dropped
 * next to a title and stay invisible until it has something to say — the header
 * keeps it in view even after the form's own footer has scrolled away.
 *
 * The pulse is `motion-safe:` only: a blinking element is exactly what a
 * reduced-motion preference is asking us not to do, and the dot still reads as a
 * status marker without it.
 */
export function UnsavedIndicator({
  visible,
  className,
}: Readonly<{ visible: boolean; className?: string }>) {
  const { t } = useTranslation();

  if (!visible) return null;

  return (
    <span
      role="status"
      className={cn("flex items-center gap-1.5 text-xs font-medium text-accent", className)}
    >
      <span
        className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent motion-safe:animate-pulse"
        aria-hidden
      />
      {t("common.unsaved")}
    </span>
  );
}
