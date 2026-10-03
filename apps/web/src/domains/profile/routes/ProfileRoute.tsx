import { useState } from "react";
import { useTranslation } from "react-i18next";

import { PageHeader } from "../../../shared/ui/page-header";
import { AccountStatusSection } from "../components/AccountStatusSection";
import type { PersonalFieldKey } from "../components/PersonalInfoSection";
import { ConsentHistorySection } from "../components/ConsentHistorySection";
import { DangerZone } from "../components/DangerZone";
import { DataPrivacySection } from "../components/DataPrivacySection";
import { FinancialCustomizationSection } from "../components/FinancialCustomizationSection";
import { NotificationsSection } from "../components/NotificationsSection";
import { PersonalInfoSection } from "../components/PersonalInfoSection";
import { PreferencesSection } from "../components/PreferencesSection";
import { ProfileCard } from "../components/ProfileCard";
import { SecuritySection } from "../components/SecuritySection";

export function ProfileRoute() {
  const { t } = useTranslation();
  // Set by the account-status checklist, handled by the section that owns the
  // field. An object (not a bare key) so asking for the same field twice is
  // two distinct requests.
  const [editRequest, setEditRequest] = useState<{ field: PersonalFieldKey } | null>(null);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("profile.title")} />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[320px_1fr] lg:items-start">
        <div className="flex flex-col gap-4 lg:sticky lg:top-6">
          <ProfileCard />
          <AccountStatusSection onEditField={(field) => setEditRequest({ field })} />
          {/* Left column from lg; below that it moves to the end of the page (see below), so a
              destructive action isn't the first thing on a phone. */}
          <div className="hidden lg:block">
            <DangerZone />
          </div>
        </div>
        <div className="flex flex-col gap-4">
          <PersonalInfoSection editRequest={editRequest} />
          <PreferencesSection />
          <FinancialCustomizationSection />
          <SecuritySection />
          <NotificationsSection />
          <DataPrivacySection />
          <ConsentHistorySection />
          <div className="lg:hidden">
            <DangerZone />
          </div>
        </div>
      </div>
    </div>
  );
}
