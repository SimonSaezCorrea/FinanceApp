import { useTranslation } from "react-i18next";

import { PageHeader } from "../../../shared/ui/page-header";
import { AccountStatusSection } from "../components/AccountStatusSection";
import { DangerZone } from "../components/DangerZone";
import { DataPrivacySection } from "../components/DataPrivacySection";
import { FinancialCustomizationSection } from "../components/FinancialCustomizationSection";
import { NotificationsSection } from "../components/NotificationsSection";
import { PersonalInfoSection } from "../components/PersonalInfoSection";
import { PlanBillingSection } from "../components/PlanBillingSection";
import { PreferencesSection } from "../components/PreferencesSection";
import { ProfileCard } from "../components/ProfileCard";
import { SecuritySection } from "../components/SecuritySection";

export function ProfileRoute() {
  const { t } = useTranslation();

  return (
    <div>
      <PageHeader title={t("profile.title")} />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[320px_1fr] lg:items-start">
        <div className="flex flex-col gap-4 lg:sticky lg:top-6">
          <ProfileCard />
          <AccountStatusSection />
        </div>
        <div className="flex flex-col gap-4">
          <PersonalInfoSection />
          <PreferencesSection />
          <FinancialCustomizationSection />
          <SecuritySection />
          <PlanBillingSection />
          <NotificationsSection />
          <DataPrivacySection />
          <DangerZone />
        </div>
      </div>
    </div>
  );
}
