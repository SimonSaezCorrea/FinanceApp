import { MoreVertical, Pencil, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";

interface Props {
  onEdit?: () => void;
  onDelete?: () => void;
}

const MENU_WIDTH = 144;

/**
 * "..." row menu — the tablet layout's stand-in for the desktop edit/delete pair.
 *
 * The panel is PORTALED rather than absolutely positioned inside the row: each
 * row is a `SwipeRow`, whose root needs `overflow-hidden` to clip the sliding
 * content, and an overflow clip traps descendants no matter their `z-index` —
 * the menu came out cut off and stacked under the following row. Rendering it
 * to `document.body` at fixed coordinates escapes that clip entirely, the same
 * approach `shared/ui/searchable-select` already uses.
 */
export function RowActionsMenu({ onEdit, onDelete }: Readonly<Props>) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const place = () => {
      const el = triggerRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      // Right-aligned to the trigger, and kept inside the viewport on the left
      // edge for a narrow screen.
      setPosition({ top: r.bottom + 4, left: Math.max(8, r.right - MENU_WIDTH) });
    };
    place();

    const onPointerDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    // Any scroll or resize moves the row out from under a fixed panel, so the
    // menu closes rather than floating detached from its trigger.
    const close = () => setOpen(false);

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", close);
    window.addEventListener("scroll", close, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [open]);

  if (!onEdit && !onDelete) return null;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t("common.options")}
        onClick={() => setOpen((o) => !o)}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted"
      >
        <MoreVertical className="h-4 w-4" aria-hidden />
      </button>

      {open && position
        ? createPortal(
            <div
              ref={panelRef}
              role="menu"
              style={{ top: position.top, left: position.left, width: MENU_WIDTH }}
              className="fixed z-50 rounded-[10px] border border-border2 bg-surface2 p-1 shadow-lg"
            >
              {onEdit ? (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setOpen(false);
                    onEdit();
                  }}
                  className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-[12.5px] text-foreground hover:bg-muted"
                >
                  <Pencil className="h-3.5 w-3.5" aria-hidden />
                  {t("common.edit")}
                </button>
              ) : null}
              {onDelete ? (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setOpen(false);
                    onDelete();
                  }}
                  className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-[12.5px] text-destructive hover:bg-destructive/10"
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden />
                  {t("common.delete")}
                </button>
              ) : null}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
