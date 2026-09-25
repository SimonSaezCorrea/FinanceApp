import { useState } from "react";
import { useTranslation } from "react-i18next";

import { CollapsibleSection } from "../../../shared/ui/collapsible-section";
import { Switch } from "../../../shared/ui/switch";

export function DataPrivacySection() {
  const { t } = useTranslation();
  const [autoBackup, setAutoBackup] = useState(true);

  return (
    <CollapsibleSection title={t("profile.dataPrivacy.title")}>
      <div className="flex items-center justify-between border-b py-3">
        <span className="text-sm">{t("profile.dataPrivacy.export")}</span>
        <div className="flex gap-1.5">
          {["CSV", "Excel", "PDF"].map((fmt) => (
            <button
              key={fmt}
              type="button"
              disabled
              title={t("profile.comingSoon")}
              className="rounded-full bg-muted px-2.5 py-1 text-[10px] font-medium disabled:opacity-50"
            >
              {fmt}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between py-3">
        <div>
          <div className="text-sm">{t("profile.dataPrivacy.autoBackup")}</div>
          <div className="text-xs text-muted-foreground">
            {t("profile.dataPrivacy.autoBackupHint")}
          </div>
        </div>
        <Switch
          checked={autoBackup}
          onCheckedChange={setAutoBackup}
          aria-label={t("profile.dataPrivacy.autoBackup")}
        />
      </div>
    </CollapsibleSection>
  );
}
