import { useTranslation } from "react-i18next";

import { formatMoney } from "@finance/money";

import { sumAmounts } from "../lib/savingsMetrics";

interface Props {
  title: string;
  amounts: string[];
  currency: string;
}

/** Cabecera de grupo: título uppercase + "{n} metas · {monto} acumulados". */
export function SavingsGroupHeader({ title, amounts, currency }: Readonly<Props>) {
  const { t, i18n } = useTranslation();
  const total = sumAmounts(amounts);
  return (
    <div className="flex items-baseline justify-between gap-3">
      <h2 className="text-[13px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
        {title}
      </h2>
      <span className="text-[13px] text-muted-foreground">
        {t("savings.groups.count", {
          count: amounts.length,
          amount: formatMoney(total, { locale: i18n.language, currency }),
        })}
      </span>
    </div>
  );
}
