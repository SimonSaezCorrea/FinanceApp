import { useTranslation } from "react-i18next";

import { formatMoney } from "@finance/money";

import { Card } from "../../../shared/ui/card";
import { useAccounts } from "../hooks/useAccounts";

export function AccountsRoute() {
  const { t, i18n } = useTranslation();
  const { data, isLoading, isError } = useAccounts();

  if (isLoading) return <p className="text-muted-foreground">{t("app.loading")}</p>;
  if (isError) return <p role="alert" className="text-destructive">{t("errors.INTERNAL_ERROR")}</p>;

  const list = data ?? [];

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">{t("accounts.title")}</h1>
      {list.length === 0 ? (
        <p className="text-muted-foreground">{t("accounts.empty")}</p>
      ) : (
        <Card>
          <ul className="divide-y">
            {list.map((acc) => (
              <li key={acc.id} className="flex items-center justify-between px-6 py-3">
                <span className="font-medium">{acc.name}</span>
                <span className="tabular-nums text-muted-foreground">
                  {formatMoney(acc.currentBalance, { locale: i18n.language, currency: acc.currency })}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
