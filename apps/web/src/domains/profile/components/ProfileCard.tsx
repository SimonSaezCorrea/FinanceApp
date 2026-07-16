import { useState } from "react";
import { useTranslation } from "react-i18next";

import { useAuth } from "../../auth/hooks/useAuth";
import { Badge } from "../../../shared/ui/badge";
import { Button } from "../../../shared/ui/button";
import { Card } from "../../../shared/ui/card";
import { getInitials } from "../../../shared/lib/initials";
import { useProfileStats } from "../hooks/useProfile";
import { EditProfileDialog } from "./EditProfileDialog";

export function ProfileCard() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const stats = useProfileStats();
  const [editing, setEditing] = useState(false);

  if (!user) return null;

  const personalInfo = [
    user.countryName,
    user.age != null ? t("profile.ageYears", { age: user.age }) : null,
    user.addressCity,
  ].filter(Boolean);

  return (
    <Card className="p-6 text-center">
      <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-brand to-accent text-2xl font-semibold text-primary-foreground">
        {getInitials(user.name, user.email)}
      </div>
      <div className="mt-3 text-lg font-semibold">{user.name || user.email}</div>
      {user.name ? <div className="text-sm text-muted-foreground">{user.email}</div> : null}
      {personalInfo.length > 0 ? (
        <div className="text-xs text-muted-foreground">{personalInfo.join(" · ")}</div>
      ) : null}
      <Badge variant="brand" className="mt-2">
        {t("profile.plan.personal")}
      </Badge>
      <Button className="mt-4 w-full" onClick={() => setEditing(true)}>
        {t("profile.editButton")}
      </Button>
      <div className="mt-4 grid grid-cols-3 divide-x border-t pt-4">
        <div>
          <div className="text-lg font-bold tabular-nums">
            {stats.isLoading ? "–" : stats.accountsCount}
          </div>
          <div className="text-xs text-muted-foreground">{t("profile.stats.accounts")}</div>
        </div>
        <div>
          <div className="text-lg font-bold tabular-nums">
            {stats.isLoading ? "–" : stats.monthlyMovementsCount}
          </div>
          <div className="text-xs text-muted-foreground">{t("profile.stats.monthlyMovements")}</div>
        </div>
        <div>
          <div className="text-lg font-bold tabular-nums">{user.memberSinceYear}</div>
          <div className="text-xs text-muted-foreground">{t("profile.stats.memberSince")}</div>
        </div>
      </div>
      <EditProfileDialog open={editing} onOpenChange={setEditing} />
    </Card>
  );
}
