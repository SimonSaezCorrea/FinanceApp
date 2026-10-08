import { useTranslation } from "react-i18next";

import { PreferencesSection } from "../components/PreferencesSection";
import { ProfileSectionPage } from "../components/ProfileSectionPage";

export function PreferencesRoute() {
  const { t } = useTranslation();
  return (
    <ProfileSectionPage
      id="preferences"
      title={t("profile.sections.preferences.title")}
      description={t("profile.sections.preferences.description")}
    >
      <PreferencesSection />
    </ProfileSectionPage>
  );
}
