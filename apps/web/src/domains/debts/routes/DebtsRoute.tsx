import { useTranslation } from "react-i18next";

import { formatMoney } from "@finance/money";

import { Card } from "../../../shared/ui/card";
import { useDebts } from "../hooks/useDebts";

export function DebtsRoute() {
  const { t, i18n } = useTranslation();
  const { data, isLoading, isError } = useDebts();

  if (isLoading) return <p className="text-muted-foreground">{t("app.loading")}</p>;
  if (isError) return <p role="alert" className="text-destructive">{t("errors.INTERNAL_ERROR")}</p>;

  const list = data ?? [];

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">{t("debts.title")}</h1>
      {list.length === 0 ? (
        <p className="text-muted-foreground">{t("debts.empty")}</p>
      ) : (
        <Card>
          <ul className="divide-y">
            {list.map((d) => (
              <li key={d.id} className="flex items-center justify-between px-6 py-3">
                <span>
                  <span className="font-medium">{d.counterparty}</span>
                  <span className="text-muted-foreground"> · {t(`debts.direction.${d.direction}`)}</span>
                </span>
                <span className="tabular-nums text-muted-foreground">
                  {formatMoney(d.principal, { locale: i18n.language, currency: d.currency })}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
