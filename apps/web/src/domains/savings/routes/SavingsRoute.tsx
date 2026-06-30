import { useTranslation } from "react-i18next";

import { formatMoney } from "@finance/money";

import { Card } from "../../../shared/ui/card";
import { PageHeader } from "../../../shared/ui/page-header";
import { EmptyState, ErrorState, LoadingState } from "../../../shared/ui/states";
import { useSavingsGoals } from "../hooks/useSavings";

export function SavingsRoute() {
  const { t, i18n } = useTranslation();
  const { data, isLoading, isError } = useSavingsGoals();
  const list = data ?? [];

  return (
    <div>
      <PageHeader title={t("savings.title")} />
      {isLoading ? (
        <LoadingState title={t("app.loading")} />
      ) : isError ? (
        <ErrorState title={t("errors.INTERNAL_ERROR")} />
      ) : list.length === 0 ? (
        <EmptyState title={t("savings.empty")} />
      ) : (
        <Card>
          <ul className="divide-y">
            {list.map((goal) => (
              <li key={goal.id} className="flex items-center justify-between px-6 py-3">
                <span className="font-medium">{goal.title}</span>
                <span className="tabular-nums text-muted-foreground">
                  {formatMoney(goal.targetAmount, {
                    locale: i18n.language,
                    currency: goal.currency,
                  })}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
