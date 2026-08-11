import { Receipt } from "lucide-react";
import { useTranslation } from "react-i18next";

/**
 * Full-viewport boot screen, shown while the session is being restored — before
 * there's a layout, a sidebar or any data to put in them.
 *
 * It deliberately doesn't reuse `LoadingState` (the dashed-border block used
 * INSIDE a page): here there is no page yet, so a small box floating in the
 * top-left corner reads as a broken render rather than as progress. Same brand
 * mark as the sidebar, so the first frame already looks like the app.
 */
export function AppSplash() {
  const { t } = useTranslation();

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex h-dvh flex-col items-center justify-center gap-6 bg-background px-6"
    >
      <div className="relative flex items-center justify-center">
        {/* Halo — decorative only; the mark itself stays perfectly legible if
            animations are off. */}
        <span
          aria-hidden
          className="absolute h-20 w-20 rounded-full bg-brand/10 motion-safe:animate-ping"
        />
        <span className="relative flex h-16 w-16 items-center justify-center rounded-2xl bg-brand/10 ring-1 ring-brand/20">
          <Receipt className="h-7 w-7 text-brand" aria-hidden />
        </span>
      </div>

      <div className="flex flex-col items-center gap-1 text-center">
        <p className="text-lg font-semibold tracking-tight">{t("brand.name")}</p>
        <p className="text-sm text-muted-foreground">{t("app.bootstrapping")}</p>
      </div>

      {/* Indeterminate: there's no percentage to report, only that we're alive.
          With reduced motion the segment simply sits still at the start. */}
      <div className="h-1 w-40 overflow-hidden rounded-full bg-muted">
        <div className="h-full w-1/3 rounded-full bg-brand motion-safe:animate-progress-sweep" />
      </div>

      <span className="sr-only">{t("app.loading")}</span>
    </div>
  );
}
