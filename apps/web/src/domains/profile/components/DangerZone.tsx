import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";

import { ApiRequestError } from "@finance/client";
import { Button } from "@finance/ui/src/shared/ui/button";
import { ConfirmModal } from "@finance/ui/src/shared/ui/overlay";
import { Field } from "../../../shared/ui/field";
import { Input } from "@finance/ui/src/shared/ui/input";
import { Switch } from "../../../shared/ui/switch";
import { useProfileMutations } from "../hooks/useProfile";

/** "Eliminar cuenta", the last block of "Datos y privacidad" (specs/029) — never next to the user's
 * identity. Signing out lives in the sidebar's user menu, so it isn't repeated here. */
export function DangerZone() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { deleteAccount } = useProfileMutations();
  const [confirming, setConfirming] = useState(false);
  const [password, setPassword] = useState("");
  const [keepHistory, setKeepHistory] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    setError(null);
    try {
      await deleteAccount.mutateAsync({ password, keepHistory });
      navigate("/");
    } catch (err) {
      const code = err instanceof ApiRequestError ? err.code : "INTERNAL_ERROR";
      setError(t(`errors.${code}`));
    }
  }

  return (
    <section
      aria-labelledby="profile-danger-title"
      className="flex flex-col gap-3 rounded-2xl border border-destructive/30 p-5 sm:flex-row sm:items-center"
    >
      <div className="flex-1">
        <h2 id="profile-danger-title" className="text-base font-semibold">
          {t("profile.danger.deactivate")}
        </h2>
        <p className="text-sm text-muted-foreground">{t("profile.danger.description")}</p>
      </div>
      <Button
        variant="outline"
        className="h-11 border-destructive/40 text-destructive hover:bg-destructive/15 sm:h-10"
        onClick={() => {
          setPassword("");
          setKeepHistory(false);
          setError(null);
          setConfirming(true);
        }}
      >
        {t("profile.danger.deactivate")}
      </Button>
      <ConfirmModal
        open={confirming}
        onOpenChange={setConfirming}
        onConfirm={() => void handleDelete()}
        title={t("profile.danger.confirmTitle")}
        description={t("profile.danger.confirmDescription")}
        confirmLabel={t("profile.danger.confirmButton")}
        loading={deleteAccount.isPending}
      >
        <Field
          label={t("profile.danger.passwordLabel")}
          htmlFor="delete-account-password"
          error={error}
        >
          <Input
            id="delete-account-password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            aria-label={t("profile.danger.passwordLabel")}
          />
        </Field>
        <div className="mt-4 flex items-start justify-between gap-3 rounded-lg border border-border bg-muted/30 p-3">
          <div>
            <p className="text-sm font-medium text-foreground">
              {t("profile.danger.keepHistoryLabel")}
            </p>
            <p className="text-xs text-muted-foreground">
              {t("profile.danger.keepHistoryDescription")}
            </p>
          </div>
          <Switch
            checked={keepHistory}
            onCheckedChange={setKeepHistory}
            aria-label={t("profile.danger.keepHistoryLabel")}
          />
        </div>
      </ConfirmModal>
    </section>
  );
}
