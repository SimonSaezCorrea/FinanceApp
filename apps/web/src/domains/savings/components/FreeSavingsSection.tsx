import { useTranslation } from "react-i18next";

import type { savings } from "@finance/contracts";
import { formatMoney } from "@finance/money";

import { sumAmounts } from "../lib/savingsMetrics";

interface Props {
  entries: savings.SavingsEntry[];
  currency: string;
  onSelect: () => void;
  onSelectEntry: (entry: savings.SavingsEntry) => void;
}

/**
 * Bloque de ahorro libre: card con borde discontinuo, total y lista de
 * aportes sin meta — README §1e. Clickeable como un todo (igual que
 * `SavingsGoalRow`): abre `FreeSavingsDetailPanel` con el mismo historial.
 * Sin botón de aporte propio — ya está el de la cabecera de la página y el
 * del propio panel de detalle, uno más acá era redundante.
 */
export function FreeSavingsSection({
  entries,
  currency,
  onSelect,
  onSelectEntry,
}: Readonly<Props>) {
  const { t, i18n } = useTranslation();
  const money = (v: string) => formatMoney(v, { locale: i18n.language, currency });
  const total = sumAmounts(entries.map((e) => e.amount));
  const sorted = [...entries].sort((a, b) => b.contributedAt.localeCompare(a.contributedAt));

  return (
    <div
      onClick={onSelect}
      className="flex cursor-pointer flex-col gap-[14px] rounded-[9.6px] border border-dashed border-border bg-card p-[18px_20px] hover:bg-accent/5"
    >
      <div>
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="text-[13px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
            {t("savings.free.title")}
          </h2>
          <span className="text-[13px] text-muted-foreground">
            {t("savings.free.count", { count: entries.length })}
          </span>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">{t("savings.free.noMeta")}</span>
          <span className="text-2xl font-semibold tabular-nums text-foreground">
            {money(total)}
          </span>
        </div>
      </div>

      {sorted.length > 0 ? (
        <ul className="flex flex-col">
          {sorted.map((e) => (
            <li key={e.id}>
              <button
                type="button"
                onClick={(ev) => {
                  ev.stopPropagation();
                  onSelectEntry(e);
                }}
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
      ) : null}
    </div>
  );
}
