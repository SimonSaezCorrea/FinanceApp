import { ChevronDown, Plus } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";

import type { movementTemplates } from "@finance/contracts";

import { cn } from "@finance/ui/src/shared/lib/cn";
import { Button } from "@finance/ui/src/shared/ui/button";
import { buttonClasses } from "@finance/ui/src/shared/ui/button-classes";
import { CategoryIcon } from "../../reference/components/CategoryIcon";
import { TemplateAmount } from "./TemplateAmount";

/**
 * "Nuevo movimiento" in Movimientos (canvas design O): with templates, a split button whose
 * arrow opens them in a menu — picking one opens the form already filled. Without templates
 * the arrow isn't drawn at all: a menu with nothing to pick would be a dead end.
 */
export function NewMovementButton({
  templates,
  onNew,
  onUseTemplate,
  size = "md",
  compactLabel = false,
}: Readonly<{
  templates: movementTemplates.MovementTemplate[];
  onNew: () => void;
  onUseTemplate: (id: string) => void;
  size?: "sm" | "md";
  /** Icon only below `sm` (the label is still read out): a narrow toolbar's button. */
  compactLabel?: boolean;
}>) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const menuId = useId();

  // Outside click closes; opening moves focus to the first template.
  useEffect(() => {
    if (!open) return;
    menuRef.current?.querySelector<HTMLElement>("[role=menuitem]")?.focus();
    const onPointer = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    return () => document.removeEventListener("pointerdown", onPointer);
  }, [open]);

  const close = (refocus = true) => {
    setOpen(false);
    if (refocus) triggerRef.current?.focus();
  };

  const onMenuKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const items = [...(menuRef.current?.querySelectorAll<HTMLElement>("[role=menuitem]") ?? [])];
    const at = items.indexOf(document.activeElement as HTMLElement);
    if (e.key === "Escape") {
      e.preventDefault();
      close();
    } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const step = e.key === "ArrowDown" ? 1 : -1;
      items[(at + step + items.length) % items.length]?.focus();
    } else if (e.key === "Home" || e.key === "End") {
      e.preventDefault();
      items[e.key === "Home" ? 0 : items.length - 1]?.focus();
    } else if (e.key === "Tab") {
      close(false);
    }
  };

  if (templates.length === 0) {
    return (
      <Button variant="accent" size={size} onClick={onNew}>
        <Plus className="h-4 w-4" aria-hidden />
        <span className={cn(compactLabel && "sr-only sm:not-sr-only")}>
          {t("transactions.new")}
        </span>
      </Button>
    );
  }

  return (
    <div ref={rootRef} className="relative flex">
      <Button variant="accent" size={size} className="rounded-r-none" onClick={onNew}>
        <Plus className="h-4 w-4" aria-hidden />
        <span className={cn(compactLabel && "sr-only sm:not-sr-only")}>
          {t("transactions.new")}
        </span>
      </Button>
      <button
        ref={triggerRef}
        type="button"
        className={buttonClasses({
          variant: "accent",
          size,
          className: "rounded-l-none border-l border-accent-foreground/20 px-2.5",
        })}
        aria-label={t("templates.useMenu")}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((o) => !o)}
      >
        <ChevronDown
          className={cn("h-4 w-4 transition-transform", open && "rotate-180")}
          aria-hidden
        />
      </button>
      {open ? (
        <div
          ref={menuRef}
          id={menuId}
          role="menu"
          aria-label={t("templates.use")}
          onKeyDown={onMenuKey}
          className="absolute right-0 top-full z-30 mt-2 flex max-h-96 w-80 flex-col overflow-y-auto rounded-xl border border-border bg-card p-1.5 shadow-lg"
        >
          <p className="px-2.5 pb-1 pt-1.5 text-xs font-medium text-muted-foreground">
            {t("templates.use")}
          </p>
          {templates.map((template) => (
            <button
              key={template.id}
              type="button"
              role="menuitem"
              tabIndex={-1}
              onClick={() => {
                close(false);
                onUseTemplate(template.id);
              }}
              className="flex min-h-11 items-center gap-3 rounded-lg px-2.5 py-2 text-left text-sm hover:bg-surface2 focus-visible:bg-surface2 focus-visible:outline-none"
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-chip">
                <CategoryIcon
                  categoryId={template.categoryId}
                  className="h-4 w-4 text-muted-foreground"
                />
              </span>
              <span className="min-w-0 flex-1 truncate font-medium">{template.name}</span>
              <TemplateAmount template={template} className="text-sm" />
            </button>
          ))}
          <div className="my-1 border-t border-border" />
          <Link
            to="/templates"
            role="menuitem"
            tabIndex={-1}
            onClick={() => close(false)}
            className="flex min-h-11 items-center rounded-lg px-2.5 text-sm text-primary hover:bg-surface2 focus-visible:bg-surface2 focus-visible:outline-none"
          >
            {t("templates.manage")}
          </Link>
        </div>
      ) : null}
    </div>
  );
}
