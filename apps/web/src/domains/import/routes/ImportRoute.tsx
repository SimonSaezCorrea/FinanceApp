import { useTranslation } from "react-i18next";

import { Card, CardContent } from "../../../shared/ui/card";
import { PageHeader } from "../../../shared/ui/page-header";

export function ImportRoute() {
  const { t } = useTranslation();

  return (
    <div>
      <PageHeader title={t("import.title")} />
      <Card>
        <CardContent className="pt-6 text-muted-foreground">{t("import.info")}</CardContent>
      </Card>
    </div>
  );
}
