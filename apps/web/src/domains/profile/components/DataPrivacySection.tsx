import { Plus } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { CollapsibleSection } from "../../../shared/ui/collapsible-section";
import { Switch } from "../../../shared/ui/switch";

interface LinkedBank {
  id: string;
  name: string;
  initials: string;
  synced: boolean;
}

// Placeholder data — no open-banking / bank-sync integration exists yet (see PENDING.md).
const INITIAL_BANKS: LinkedBank[] = [
  { id: "b1", name: "Banco Estado", initials: "BE", synced: true },
  { id: "b2", name: "Falabella CMR", initials: "FC", synced: false },
];

export function DataPrivacySection() {
  const { t } = useTranslation();
  // Local-only — toggling doesn't call any real bank-sync API (see PENDING.md).
  const [banks, setBanks] = useState(INITIAL_BANKS);
  const [autoBackup, setAutoBackup] = useState(true);

  return (
    <CollapsibleSection title={t("profile.dataPrivacy.title")}>
      <div className="mb-1.5 text-xs text-muted-foreground">{t("profile.dataPrivacy.linkedBanks")}</div>
      <div className="mb-4 overflow-hidden rounded-lg border">
        {banks.map((b, i) => (
          <div
            key={b.id}
            className={i < banks.length - 1 ? "flex items-center gap-3 border-b px-3.5 py-2.5" : "flex items-center gap-3 px-3.5 py-2.5"}
          >
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted text-[10px] font-bold text-primary">
              {b.initials}
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-xs font-medium">{b.name}</div>
              <div className={b.synced ? "text-[10px] text-success" : "text-[10px] text-muted-foreground"}>
                {b.synced ? t("profile.dataPrivacy.synced") : t("profile.dataPrivacy.paused")}
              </div>
            </div>
            <Switch
              checked={b.synced}
              onCheckedChange={(checked) =>
                setBanks((prev) => prev.map((x) => (x.id === b.id ? { ...x, synced: checked } : x)))
              }
              aria-label={b.name}
            />
          </div>
        ))}
        <button
          type="button"
          disabled
          title={t("profile.comingSoon")}
          className="flex w-full items-center gap-2 px-3.5 py-2.5 text-xs font-medium text-primary disabled:opacity-50"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden />
          {t("profile.dataPrivacy.linkAnother")}
        </button>
      </div>

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
          <div className="text-xs text-muted-foreground">{t("profile.dataPrivacy.autoBackupHint")}</div>
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
