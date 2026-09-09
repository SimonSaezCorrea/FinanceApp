import { PlusCircle } from "lucide-react";
import { useTranslation } from "react-i18next";

import type { savings } from "@finance/contracts";
import { formatMoney } from "@finance/money";

import { Button } from "../../../shared/ui/button";
import { SidePanel } from "../../../shared/ui/overlay";
import { sumAmounts } from "../lib/savingsMetrics";

interface Props {
  open: boolean;
  entries: savings.SavingsEntry[];
  currency: string;
  onOpenChange: (open: boolean) => void;
  onContribute: () => void;
  onSelectEntry: (entry: savings.SavingsEntry) => void;
}

/**
 * Detalle del ahorro libre como bloque — mismo shell que
 * `SavingsGoalDetailPanel` (total + historial), sin lo que no aplica a algo
 * sin meta (progreso, plazo, cerrar). `FreeSavingsSection` es solo el
 * resumen; el historial completo vive aquí.
 */
export function FreeSavingsDetailPanel({
  open,
  entries,
  currency,
  onOpenChange,
  onContribute,
  onSelectEntry,
}: Readonly<Props>) {
  const { t, i18n } = useTranslation();
  const money = (v: string) => formatMoney(v, { locale: i18n.language, currency });
  const total = sumAmounts(entries.map((e) => e.amount));
  const sorted = [...entries].sort((a, b) => b.contributedAt.localeCompare(a.contributedAt));

  return (
    <SidePanel
      open={open}
      onOpenChange={onOpenChange}
      eyebrow={t("savings.free.eyebrow")}
      title={<span className="text-[22px] font-semibold tracking-tight">{t("savings.free.title")}</span>}
      description={t("savings.free.noMeta")}
      footer={
        <Button variant="accent" className="w-full" onClick={onContribute}>
          <PlusCircle className="h-4 w-4" aria-hidden />
          {t("savings.free.contribute")}
        </Button>
      }
    >
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-1 border-b border-border pb-3">
          <span className="text-xs text-muted-foreground">{t("savings.total.label")}</span>
          <span className="text-3xl font-semibold tabular-nums text-foreground">{money(total)}</span>
        </div>

        <section className="flex flex-col gap-1">
          <h3 className="text-[13px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
            {t("savings.detail.history")}
          </h3>
          {sorted.length > 0 ? (
            <ul className="flex flex-col">
              {sorted.map((e) => (
                <li key={e.id}>
                  <button
                    type="button"
                    onClick={() => onSelectEntry(e)}
                    className="flex w-full items-center justify-between gap-3 border-t border-border py-2.5 text-left hover:bg-accent/5"
                  >
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate text-sm text-foreground">
                        {e.title ?? e.note ?? t("savings.free.noNote")}
                      </span>
                      <span className="truncate text-xs text-muted-foreground">
                        {[
                          e.title && e.note ? e.note : null,
                          new Date(e.contributedAt).toLocaleDateString(i18n.language, {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          }),
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </span>
                    <span className="shrink-0 text-sm font-medium tabular-nums text-success">
                      +{money(e.amount)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="py-2 text-sm text-muted-foreground">{t("savings.free.historyEmpty")}</p>
          )}
        </section>
      </div>
    </SidePanel>
  );
}
