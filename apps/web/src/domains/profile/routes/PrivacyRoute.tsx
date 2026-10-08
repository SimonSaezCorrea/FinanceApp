import { useTranslation } from "react-i18next";

import { ConsentHistorySection } from "../components/ConsentHistorySection";
import { DangerZone } from "../components/DangerZone";
import { ProfileSectionPage } from "../components/ProfileSectionPage";

export function PrivacyRoute() {
  const { t } = useTranslation();
  return (
    <ProfileSectionPage
      id="privacy"
      title={t("profile.sections.privacy.title")}
      description={t("profile.sections.privacy.description")}
    >
      <ConsentHistorySection />
      <DangerZone />
    </ProfileSectionPage>
  );
}
