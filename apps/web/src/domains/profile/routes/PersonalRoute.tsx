import { useTranslation } from "react-i18next";

import { PersonalInfoSection } from "../components/PersonalInfoSection";
import { ProfileSectionPage } from "../components/ProfileSectionPage";

export function PersonalRoute() {
  const { t } = useTranslation();
  return (
    <ProfileSectionPage
      id="personal"
      title={t("profile.sections.personal.title")}
      description={t("profile.sections.personal.description")}
    >
      <PersonalInfoSection />
    </ProfileSectionPage>
  );
}
