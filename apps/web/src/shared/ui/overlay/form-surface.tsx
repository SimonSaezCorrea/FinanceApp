import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "../button";
import { UnsavedIndicator } from "../unsaved-indicator";
import { SidePanel } from "./side-panel";
import { ResponsiveSurface } from "./surface";

interface FormSurfaceProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * `create` and `edit` are the same frame with different promises: creating is
   * disposable (cancel loses nothing that existed before), editing changes
   * something that already exists, so it shows what's pending and keeps its
   * submit labelled as saving rather than adding.
   */
  mode: "create" | "edit";
  /**
   * Which shell the form lives in. `panel` (a right-side drawer, full-screen on a
   * phone) is right for a form long enough to scroll, or one where the record
   * behind it is useful context; `modal` stays for the short, self-contained ones.
   */
  surface?: "modal" | "panel";
  /** Usually a string; a node for a form whose visible title lives in its body
   * (pass an `sr-only` span so the dialog still has an accessible name). */
  title: ReactNode;
  description?: string;
  headerAside?: ReactNode;
  /** Overrides the mode's default submit label. */
  submitLabel?: string;
  onSubmit: () => void;
  canSubmit?: boolean;
  submitting?: boolean;
  /** `edit` only: pending-changes marker in the footer (and the header on a phone). */
  dirty?: boolean;
  /** Extra footer action beside the submit (e.g. "save and create another"). */
  extraActions?: ReactNode;
  /** Small caps label above the title, naming what the surface is. */
  eyebrow?: string;
  /**
   * Drops the Cancel button: on a panel whose header already carries a close
   * control, a second "way out" only competes with the primary action. The
   * header's ✕ (and Esc, and the backdrop) remain the way to back out.
   */
  hideCancel?: boolean;
  className?: string;
  children: ReactNode;
}

/**
 * The create/edit form overlay: `ResponsiveSurface` plus the action bar every one
 * of those forms needs, so no screen re-invents where its submit button lives or
 * what it's called.
 *
 * Cancel is hidden on the window form — there the header's close control is
 * already the way out, and dropping the button gives the primary action the full
 * width (a comfortable touch target) instead of splitting it.
 */
export function FormSurface({
  open,
  onOpenChange,
  mode,
  surface = "modal",
  title,
  eyebrow,
  hideCancel = false,
  description,
  headerAside,
  submitLabel,
  onSubmit,
  canSubmit = true,
  submitting = false,
  dirty = false,
  extraActions,
  className,
  children,
}: Readonly<FormSurfaceProps>) {
  const { t } = useTranslation();
  const showDirty = mode === "edit" && dirty;
  const Shell = surface === "panel" ? SidePanel : ResponsiveSurface;

  return (
    <Shell
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      eyebrow={eyebrow}
      description={description}
      headerAside={headerAside ?? (showDirty ? <UnsavedIndicator visible /> : undefined)}
      className={className}
      footer={
        <div className="flex items-center justify-end gap-2">
          {showDirty ? <UnsavedIndicator visible className="mr-auto max-sm:hidden" /> : null}
          {hideCancel ? null : (
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
              className="max-sm:hidden"
            >
              {t("common.cancel")}
            </Button>
          )}
          {extraActions}
          <Button
            variant="accent"
            onClick={onSubmit}
            disabled={!canSubmit || submitting}
            className="max-sm:h-[50px] max-sm:w-full max-sm:text-base"
          >
            {submitLabel ?? (mode === "edit" ? t("common.saveChanges") : t("common.create"))}
          </Button>
        </div>
      }
    >
      {children}
    </Shell>
  );
}
