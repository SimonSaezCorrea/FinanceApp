import { AlertTriangle, CalendarClock } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";

import { formatMoney } from "@finance/money";

import { cn } from "../../../shared/lib/cn";
import { MaskedAmount } from "../../profile/components/MaskedAmount";
import type { AttentionItem } from "../lib/metrics";

const DAY_MS = 86_400_000;

/** "Vence hoy" / "mañana" / "el viernes 9" / "Venció el lunes 5", in calendar days. */
function useDueLabel() {
  const { t, i18n } = useTranslation();
  return (date: string, now: Date) => {
    const due = new Date(date);
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const day = new Date(due.getFullYear(), due.getMonth(), due.getDate()).getTime();
    const diff = Math.round((day - today) / DAY_MS);
    // "el viernes 10" is ambiguous once the date isn't in the current month: name the month then.
    const sameMonth = due.getMonth() === now.getMonth() && due.getFullYear() === now.getFullYear();
    // Within this month the weekday helps ("el viernes 9"); further away, the date alone is
    // shorter and clearer ("el 3 de agosto").
    const pretty = due.toLocaleDateString(
      i18n.language,
      sameMonth ? { weekday: "long", day: "numeric" } : { day: "numeric", month: "long" },
    );
    if (diff < 0) return t("dashboard.attention.overdueOn", { date: pretty });
    if (diff === 0) return t("dashboard.attention.dueToday");
    if (diff === 1) return t("dashboard.attention.dueTomorrow");
    return t("dashboard.attention.dueOn", { date: pretty });
  };
}

/**
 * What the Panel shows before any figure: what needs a decision soon. A row of cards when there
 * is room (`layout="row"`), a sideways scroll otherwise (the next card peeks in); on a phone it
 * also counts "1 de 3". Each card goes where the thing gets resolved. `dense` lays each card on
 * one line (icon, what and how much, when) for the one-screen desktop Panel.
 */
export function AttentionStrip({
  items,
  now,
  layout,
  showCount = false,
  dense = false,
}: Readonly<{
  items: AttentionItem[];
  now: Date;
  layout: "row" | "scroll";
  showCount?: boolean;
  dense?: boolean;
}>) {
  const { t, i18n } = useTranslation();
  const dueLabel = useDueLabel();
  const [index, setIndex] = useState(0);

  return (
    <section aria-labelledby="dashboard-attention-title" className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="dashboard-attention-title" className="text-sm font-semibold">
          {t("dashboard.attention.title")}
        </h2>
        {showCount && items.length > 1 ? (
          <span className="font-mono text-xs text-muted-foreground" aria-hidden>
            {t("dashboard.attention.count", { current: index + 1, total: items.length })}
          </span>
        ) : null}
      </div>

      {items.length === 0 ? (
        <p className="rounded-xl border bg-card px-4 py-3 text-sm text-muted-foreground">
          {t("dashboard.attention.none")}
        </p>
      ) : (
        <ul
          className={cn(
            layout === "row"
              ? "grid gap-2.5 [grid-template-columns:repeat(auto-fit,minmax(15rem,1fr))]"
              : "-mx-4 flex snap-x snap-mandatory gap-2.5 overflow-x-auto px-4 pb-1 [scrollbar-width:thin]",
          )}
          onScroll={(e) => {
            const el = e.currentTarget;
            const card = el.firstElementChild?.getBoundingClientRect().width ?? 1;
            setIndex(Math.min(items.length - 1, Math.round(el.scrollLeft / (card + 10))));
          }}
        >
          {items.map((item) => {
            const urgent = item.overdue || item.kind === "statement";
            const Icon = urgent ? AlertTriangle : CalendarClock;
            const title =
              item.kind === "statement"
                ? t("dashboard.attention.statement", { account: item.label })
                : item.label;
            // Past due is red; a statement coming due is amber; a payment in the next days is the brand tone.
            const tone = item.overdue
              ? "bg-destructive/15 text-destructive"
              : urgent
                ? "bg-warning/15 text-warning"
                : "bg-primary/10 text-primary";
            const amount = (
              <MaskedAmount>
                {formatMoney(item.amount, { locale: i18n.language, currency: item.currency })}
              </MaskedAmount>
            );
            if (dense) {
              return (
                <li key={`${item.kind}-${item.id}`}>
                  <Link
                    to={item.href}
                    className="grid h-full grid-cols-[2rem_minmax(0,1fr)_auto] items-center gap-x-3 rounded-xl border bg-card px-3 py-2.5 transition-colors hover:border-border2"
                  >
                    <span
                      className={cn("grid size-8 place-items-center rounded-lg", tone)}
                      aria-hidden
                    >
                      <Icon className="size-4" />
                    </span>
                    <span className="min-w-0 leading-tight">
                      <span className="block truncate text-sm font-semibold">{title}</span>
                      <span className="block text-sm tabular-nums text-muted-foreground">
                        {amount}
                      </span>
                    </span>
                    <span
                      className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", tone)}
                    >
                      {dueLabel(item.date, now)}
                    </span>
                  </Link>
                </li>
              );
            }
            return (
              <li
                key={`${item.kind}-${item.id}`}
                className={cn(layout === "scroll" && "w-[17.5rem] shrink-0 snap-start")}
              >
                <Link
                  to={item.href}
                  className="grid h-full grid-cols-[2rem_minmax(0,1fr)] gap-x-3 gap-y-1 rounded-xl border bg-card p-3.5 transition-colors hover:border-border2"
                >
                  <span
                    className={cn("row-span-3 grid size-8 place-items-center rounded-lg", tone)}
                    aria-hidden
                  >
                    <Icon className="size-4" />
                  </span>
                  <span
                    className={cn(
                      "justify-self-start rounded-full px-2 py-0.5 text-[11px] font-semibold",
                      tone,
                    )}
                  >
                    {dueLabel(item.date, now)}
                  </span>
                  <span className="truncate text-sm font-semibold">{title}</span>
                  <span className="text-sm tabular-nums text-muted-foreground">
                    <MaskedAmount>
                      {formatMoney(item.amount, { locale: i18n.language, currency: item.currency })}
                    </MaskedAmount>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
