import { useTranslation } from "react-i18next";

import { Card } from "../../../shared/ui/card";
import { PageHeader } from "../../../shared/ui/page-header";
import { EmptyState, ErrorState, LoadingState } from "../../../shared/ui/states";
import { useInvestments } from "../hooks/useInvestments";

export function InvestmentsRoute() {
  const { t } = useTranslation();
  const { data, isLoading, isError, error, refetch } = useInvestments();
  const list = data ?? [];

  return (
    <div>
      <PageHeader title={t("investments.title")} />
      {isLoading ? (
        <LoadingState title={t("app.loading")} />
      ) : isError ? (
        <ErrorState error={error} onRetry={() => refetch()} />
      ) : list.length === 0 ? (
        <EmptyState title={t("investments.empty")} />
      ) : (
        <Card>
          <ul className="divide-y">
            {list.map((inv) => (
              <li key={inv.id} className="flex items-center justify-between px-6 py-3">
                <span className="font-medium">{inv.label}</span>
                <span className="text-muted-foreground">{t(`investments.kind.${inv.kind}`)}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
