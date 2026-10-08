import { useTranslation } from "react-i18next";

import { ProfileSectionPage } from "../components/ProfileSectionPage";
import { ProfileSummary } from "../components/ProfileSummary";

export function SummaryRoute() {
  const { t } = useTranslation();
  return (
    <ProfileSectionPage
      id="summary"
      title={t("profile.sections.summary.title")}
      description={t("profile.summary.description")}
    >
      <ProfileSummary />
    </ProfileSectionPage>
  );
}
