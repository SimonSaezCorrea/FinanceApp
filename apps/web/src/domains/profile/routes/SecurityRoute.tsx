import { useTranslation } from "react-i18next";

import { ProfileSectionPage } from "../components/ProfileSectionPage";
import { SecuritySection } from "../components/SecuritySection";

export function SecurityRoute() {
  const { t } = useTranslation();
  return (
    <ProfileSectionPage
      id="security"
      title={t("profile.sections.security.title")}
      description={t("profile.sections.security.description")}
    >
      <SecuritySection />
    </ProfileSectionPage>
  );
}
