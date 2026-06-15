import { useTranslation } from "react-i18next";

import { Card, CardContent } from "../shared/ui/card";
import { PageHeader } from "../shared/ui/page-header";

export function DashboardPage() {
  const { t } = useTranslation();
  return (
    <div>
      <PageHeader title={t("brand.name")} />
      <Card>
        <CardContent className="pt-6 text-muted-foreground">{t("app.welcome")}</CardContent>
      </Card>
    </div>
  );
}
