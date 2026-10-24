import { ChevronRight, Plus } from "lucide-react";
import { useTranslation } from "react-i18next";

import { formatMoney } from "@finance/money";

import { Button } from "@finance/ui/src/shared/ui/button";
import { cn } from "@finance/ui/src/shared/lib/cn";
import { EXAMPLE_KEYS, EXAMPLE_TYPE, type ExampleKey } from "../lib/examples";

interface Props {
  onExample: (key: ExampleKey) => void;
  onCreate: () => void;
}

const PREVIEW_ROWS = [
  { key: "groceries", amount: "54320", value: true },
  { key: "fuel", amount: "38000", value: false },
  { key: "streaming", amount: "12990", value: false },
] as const;

/**
 * "Columnas propias" with none yet: what a column is, shown on a sample of the Movimientos table
 * with one added, and ready-made examples that open the form already filled.
 */
export function CustomFieldsEmpty({ onExample, onCreate }: Readonly<Props>) {
  const { t, i18n } = useTranslation();

  return (
    <section className="grid gap-8 rounded-2xl border border-border bg-card p-6 sm:p-8 lg:grid-cols-2 lg:gap-10">
      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-2">
          <h2 className="text-xl font-bold">{t("customFields.empty.title")}</h2>
          <p className="text-sm text-muted-foreground">{t("customFields.empty.description")}</p>
        </div>

        <div className="flex flex-col gap-2">
          <h3 className="text-xs font-medium text-muted-foreground">
            {t("customFields.examples.title")}
          </h3>
          <ul className="flex flex-col gap-2">
            {EXAMPLE_KEYS.map((key) => (
              <li key={key}>
                <button
                  type="button"
                  onClick={() => onExample(key)}
                  className="flex min-h-14 w-full items-center gap-3 rounded-xl border border-border px-4 py-3 text-left hover:border-primary/60 hover:bg-surface2"
                >
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="flex items-center gap-2">
                      <span className="font-semibold">
                        {t(`customFields.examples.${key}.name`)}
                      </span>
                      <span className="rounded-full bg-chip px-2 py-0.5 text-xs text-primary">
                        {t(`customFields.type.${EXAMPLE_TYPE[key]}`)}
                      </span>
                    </span>
                    <span className="text-sm text-muted-foreground">
                      {t(`customFields.examples.${key}.hint`)}
                    </span>
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        </div>

        <Button variant="outline" className="self-start" onClick={onCreate}>
          <Plus className="h-4 w-4" aria-hidden />
          {t("customFields.examples.fromScratch")}
        </Button>
      </div>

      <figure className="flex flex-col gap-3 self-center">
        <figcaption className="text-xs font-medium text-muted-foreground">
          {t("customFields.examples.previewCaption")}
        </figcaption>
        <div className="overflow-hidden rounded-xl border border-border text-sm" aria-hidden>
          <div className="grid grid-cols-[minmax(0,1fr)_7rem_7rem] gap-3 bg-muted/50 px-4 py-2.5 text-xs font-medium text-muted-foreground">
            <span>{t("customFields.examples.previewDescription")}</span>
            <span className="text-right">{t("customFields.examples.previewAmount")}</span>
            <span className="rounded-md bg-primary/10 px-2 text-primary">
              {t("customFields.examples.transferred.name")}
            </span>
          </div>
          {PREVIEW_ROWS.map((row) => (
            <div
              key={row.key}
              className="grid grid-cols-[minmax(0,1fr)_7rem_7rem] items-center gap-3 border-t border-border px-4 py-3"
            >
              <span className="truncate">{t(`customFields.examples.rows.${row.key}`)}</span>
              <span className="text-right tabular-nums text-destructive">
                -{formatMoney(row.amount, { currency: "CLP", locale: i18n.language })}
              </span>
              <span
                className={cn(
                  "justify-self-start rounded-full px-2.5 py-0.5 text-xs",
                  row.value ? "bg-primary/15 text-primary" : "bg-accent/15 text-accent",
                )}
              >
                {row.value ? t("customFields.values.yes") : t("customFields.values.no")}
              </span>
            </div>
          ))}
        </div>
        <p className="text-xs text-dim">{t("customFields.examples.previewHint")}</p>
      </figure>
    </section>
  );
}
