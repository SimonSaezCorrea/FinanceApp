import { formatMoney } from "@finance/money";
import { Lock } from "lucide-react";
import { useTranslation } from "react-i18next";

import { DetailRow } from "../../../shared/ui/detail-row";

interface Props {
  totalPrincipal: string;
  currency: string;
  installmentCount: number;
  startDate: string;
  /** Spec 014, FR-006b: only the card of a CREDIT-card plan freezes, and only once
   * it has billed its first instalment — never shown otherwise. */
  cardLabel?: string | null;
}

/**
 * The three fields editing a plan cannot change — total, number of instalments and
 * first due date — SHOWN with their values, their reason and their way out (FR-048).
 *
 * They are shown rather than hidden because a form that silently drops fields it had
 * when creating reads as a bug: the user looks for the amount, does not find it, and
 * cannot tell whether it is missing or unchangeable. The reason (the schedule and its
 * payments are built from them) and the alternative (delete and create again) turn a
 * dead end into a decision.
 */
export function ImmutableFieldsNotice({
  totalPrincipal,
  currency,
  installmentCount,
  startDate,
  cardLabel,
}: Readonly<Props>) {
  const { t, i18n } = useTranslation();

  return (
    <section className="flex flex-col rounded-md border border-border bg-muted/30 p-3">
      <h3 className="flex items-center gap-2 pb-1 text-sm font-semibold">
        <Lock className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
        {t("installments.immutable.title")}
      </h3>

      <DetailRow
        label={t("installments.form.totalPrincipal")}
        value={formatMoney(totalPrincipal, { currency, locale: i18n.language })}
      />
      <DetailRow label={t("installments.form.installmentCount")} value={installmentCount} />
      <DetailRow
        label={t("installments.form.startDate")}
        value={new Date(startDate).toLocaleDateString(i18n.language, {
          day: "2-digit",
          month: "short",
          year: "numeric",
        })}
      />
      {cardLabel && <DetailRow label={t("installments.form.card")} value={cardLabel} />}

      <p className="pt-2 text-xs text-muted-foreground">
        {cardLabel ? t("installments.immutable.reasonBilled") : t("installments.immutable.reason")}
      </p>
    </section>
  );
}
