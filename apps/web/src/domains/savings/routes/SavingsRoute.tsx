import { useTranslation } from "react-i18next";

import { formatMoney } from "@finance/money";

import { Card } from "../../../shared/ui/card";
import { useSavingsGoals } from "../hooks/useSavings";

export function SavingsRoute() {
  const { t, i18n } = useTranslation();
  const { data, isLoading, isError } = useSavingsGoals();

  if (isLoading) return <p className="text-muted-foreground">{t("app.loading")}</p>;
  if (isError) return <p role="alert" className="text-destructive">{t("errors.INTERNAL_ERROR")}</p>;

  const list = data ?? [];

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">{t("savings.title")}</h1>
      {list.length === 0 ? (
        <p className="text-muted-foreground">{t("savings.empty")}</p>
      ) : (
        <Card>
          <ul className="divide-y">
            {list.map((goal) => (
              <li key={goal.id} className="flex items-center justify-between px-6 py-3">
                <span className="font-medium">{goal.title}</span>
                <span className="tabular-nums text-muted-foreground">
                  {formatMoney(goal.targetAmount, { locale: i18n.language, currency: goal.currency })}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
