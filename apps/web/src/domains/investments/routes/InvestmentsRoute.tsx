import { useTranslation } from "react-i18next";

import { Card } from "../../../shared/ui/card";
import { useInvestments } from "../hooks/useInvestments";

export function InvestmentsRoute() {
  const { t } = useTranslation();
  const { data, isLoading, isError } = useInvestments();

  if (isLoading) return <p className="text-muted-foreground">{t("app.loading")}</p>;
  if (isError) return <p role="alert" className="text-destructive">{t("errors.INTERNAL_ERROR")}</p>;

  const list = data ?? [];

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">{t("investments.title")}</h1>
      {list.length === 0 ? (
        <p className="text-muted-foreground">{t("investments.empty")}</p>
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
