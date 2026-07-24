import { useState } from "react";
import { CircleCheck } from "lucide-react";
import { useTranslation } from "react-i18next";

import { useAuth } from "../../auth/hooks/useAuth";
import { Badge } from "../../../shared/ui/badge";
import { Button } from "../../../shared/ui/button";
import { Card } from "../../../shared/ui/card";
import { EditProfileDialog } from "./EditProfileDialog";

interface ChecklistItem {
  key: string;
  done: boolean;
}

function ItemAction({ item, onEdit }: Readonly<{ item: ChecklistItem; onEdit: () => void }>) {
  const { t } = useTranslation();

  if (item.done) {
    return (
      <Badge variant="success" className="text-[10px]">
        {t("profile.accountStatus.done")}
      </Badge>
    );
  }
  if (item.key === "photo") {
    return (
      <Button
        variant="outline"
        size="sm"
        className="h-6 rounded-full px-2.5 text-[10px]"
        disabled
        title={t("profile.comingSoon")}
      >
        {t("profile.accountStatus.action.photo")}
      </Button>
    );
  }
  return (
    <Button
      variant="outline"
      size="sm"
      className="h-6 rounded-full px-2.5 text-[10px]"
      onClick={onEdit}
    >
      {t(`profile.accountStatus.action.${item.key}`)}
    </Button>
  );
}

/**
 * "Completeness", not verification: each row reflects whether the field is filled in, not that it
 * was cryptographically/manually verified (no email/SMS/identity-verification infra exists yet —
 * see PENDING.md). Profile photo is always pending: this app only ever renders initials (no upload).
 */
export function AccountStatusSection() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [editing, setEditing] = useState(false);

  if (!user) return null;

  const items: ChecklistItem[] = [
    { key: "email", done: Boolean(user.email) },
    { key: "identity", done: Boolean(user.identifierValue) },
    { key: "phone", done: Boolean(user.phone) },
    { key: "photo", done: false },
  ];
  const doneCount = items.filter((i) => i.done).length;
  const pct = Math.round((doneCount / items.length) * 100);

  return (
    <Card className="p-5">
      <h2 className="mb-4 text-sm font-semibold">{t("profile.accountStatus.title")}</h2>
      <div className="mb-4 flex items-center gap-4">
        <div
          className="flex h-[82px] w-[82px] shrink-0 items-center justify-center rounded-full"
          style={{
            background: `conic-gradient(hsl(var(--primary)) ${pct}%, hsl(var(--muted)) ${pct}% 100%)`,
          }}
        >
          <div className="flex h-[62px] w-[62px] flex-col items-center justify-center rounded-full bg-card">
            <div className="text-lg font-bold tabular-nums tracking-tight">{pct}%</div>
            <div className="text-[9px] text-muted-foreground">
              {t("profile.accountStatus.complete")}
            </div>
          </div>
        </div>
        <p className="text-xs leading-relaxed text-muted-foreground">
          {t("profile.accountStatus.blurb")}
        </p>
      </div>
      <div className="flex flex-col gap-2.5">
        {items.map((item) => (
          <div key={item.key} className="flex items-center justify-between">
            <span className="flex items-center gap-2 text-xs text-muted-foreground">
              <CircleCheck
                className={
                  item.done ? "h-3.5 w-3.5 text-success" : "h-3.5 w-3.5 text-muted-foreground/50"
                }
                aria-hidden
              />
              {t(`profile.accountStatus.items.${item.key}`)}
            </span>
            <ItemAction item={item} onEdit={() => setEditing(true)} />
          </div>
        ))}
      </div>
      <EditProfileDialog open={editing} onOpenChange={setEditing} />
    </Card>
  );
}
