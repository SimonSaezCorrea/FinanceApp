import { useTranslation } from "react-i18next";

import { formatMoney } from "@finance/money";

import { Card } from "../../../shared/ui/card";
import { PageHeader } from "../../../shared/ui/page-header";
import { EmptyState, ErrorState, LoadingState } from "../../../shared/ui/states";
import { useAccounts } from "../hooks/useAccounts";

export function AccountsRoute() {
  const { t, i18n } = useTranslation();
  const { data, isLoading, isError } = useAccounts();
  const list = data ?? [];

  return (
    <div>
      <PageHeader title={t("accounts.title")} />
      {isLoading ? (
        <LoadingState title={t("app.loading")} />
      ) : isError ? (
        <ErrorState title={t("errors.INTERNAL_ERROR")} />
      ) : list.length === 0 ? (
        <EmptyState title={t("accounts.empty")} />
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
