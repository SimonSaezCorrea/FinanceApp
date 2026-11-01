import { Plus } from "lucide-react";
import { useTranslation } from "react-i18next";

import type { movementTemplates } from "@finance/contracts";

import { CategoryIcon } from "../../reference/components/CategoryIcon";

/** How many templates the strip shows; the rest are in the "Nuevo movimiento" menu. */
const SHORTCUTS = 4;

/**
 * "Atajos" above Movimientos' table (canvas design O): the first templates as one-tap
 * chips — each opens the new-movement form already filled — and a way to make a new one.
 * Nothing renders without templates (the empty Plantillas screen explains them instead).
 */
export function TemplateShortcuts({
  templates,
  onUse,
  onCreate,
}: Readonly<{
  templates: movementTemplates.MovementTemplate[];
  onUse: (id: string) => void;
  onCreate: () => void;
}>) {
  const { t } = useTranslation();
  if (templates.length === 0) return null;
  return (
    <section aria-label={t("templates.shortcuts")} className="flex items-center gap-3">
      <h2 className="shrink-0 text-xs font-medium text-muted-foreground">
        {t("templates.shortcuts")}
      </h2>
      <div className="flex min-w-0 flex-1 gap-2 overflow-x-auto scrollbar-thin">
        {templates.slice(0, SHORTCUTS).map((template) => (
          <button
            key={template.id}
            type="button"
            onClick={() => onUse(template.id)}
            className="flex min-h-11 shrink-0 items-center gap-2 rounded-full border border-border bg-card px-3.5 text-sm hover:bg-surface2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <CategoryIcon
              categoryId={template.categoryId}
              className="h-4 w-4 text-muted-foreground"
            />
            {template.name}
          </button>
        ))}
        <button
          type="button"
          onClick={onCreate}
          className="flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border border-dashed border-input px-3.5 text-sm text-muted-foreground hover:bg-surface2 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Plus className="h-4 w-4" aria-hidden />
          {t("templates.new")}
        </button>
      </div>
    </section>
  );
}
