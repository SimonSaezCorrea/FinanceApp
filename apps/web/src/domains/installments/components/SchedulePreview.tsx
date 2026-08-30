import { formatMoney, toMoney } from "@finance/money";
import { CalendarClock, Info } from "lucide-react";
import { useTranslation } from "react-i18next";

import { DetailRow } from "../../../shared/ui/detail-row";
import type { SchedulePreview as Preview } from "../lib/schedulePreview";

interface Props {
  preview: Preview | null;
  currency: string;
  /** True when the plan names a card: only then does interest become a finance
   *  charge on that card's account (FR-045). */
  hasCard: boolean;
}

/**
 * What the plan will look like once saved — computed with the SAME function the
 * server uses (`schedulePreview` wraps `equalPrincipalSchedule`), so the figures the
 * user reads here are the ones that get stored, to the last cent (FR-042).
 *
 * With not enough typed in yet it says so (FR-043) instead of showing a zero, which
 * would read as a real answer.
 */
export function SchedulePreview({ preview, currency, hasCard }: Readonly<Props>) {
  const { t, i18n } = useTranslation();
  const money = (amount: string) => formatMoney(amount, { currency, locale: i18n.language });
  const date = (value: Date) =>
    value.toLocaleDateString(i18n.language, { day: "2-digit", month: "short", year: "numeric" });

  if (preview === null) {
    return (
      <section className="flex items-center gap-2 rounded-md border border-dashed border-border p-3 text-xs text-muted-foreground">
        <CalendarClock className="h-4 w-4 shrink-0" aria-hidden />
        {t("installments.preview.insufficient")}
      </section>
    );
  }

  const hasInterest = toMoney(preview.financeCharge).greaterThan(0);

  return (
    <section
      data-testid="schedule-preview"
      className="flex flex-col rounded-md border border-border bg-muted/30 p-3"
    >
      <h3 className="pb-1 text-sm font-semibold">{t("installments.preview.title")}</h3>

      <DetailRow
        label={t("installments.preview.perInstallment")}
        value={money(preview.installmentAmount)}
      />
      <DetailRow label={t("installments.preview.first")} value={date(preview.firstDueDate)} />
      <DetailRow label={t("installments.preview.last")} value={date(preview.lastDueDate)} />
      <DetailRow label={t("installments.preview.total")} value={money(preview.total)} />

      {/* FR-041: the last instalment absorbs the rounding remainder. Showing the
          average alone would leave a cent unexplained on the final payment. */}
      {preview.hasRoundingAdjustment && (
        <p className="pt-2 text-xs text-muted-foreground">
          {t("installments.preview.roundingAdjustment", {
            amount: money(preview.lastInstallmentAmount),
          })}
        </p>
      )}

      {/* FR-045: a plan with interest on a card charges the difference to that card's
          account. It already happened silently; now it is announced before saving. */}
      {hasInterest && (
        <p className="flex gap-2 pt-2 text-xs text-muted-foreground">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          {hasCard
            ? t("installments.preview.financeCharge", { amount: money(preview.financeCharge) })
            : t("installments.preview.interestNoCard", {
                amount: money(preview.financeCharge),
              })}
        </p>
      )}
    </section>
  );
}
