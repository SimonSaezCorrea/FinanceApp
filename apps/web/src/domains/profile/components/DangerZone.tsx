import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";

import { useAuth } from "../../auth/hooks/useAuth";
import { ApiRequestError } from "../../../shared/lib/apiClient";
import { Button } from "../../../shared/ui/button";
import { ConfirmDialog } from "../../../shared/ui/confirm-dialog";
import { Field } from "../../../shared/ui/field";
import { Input } from "../../../shared/ui/input";
import { useProfileMutations } from "../hooks/useProfile";

export function DangerZone() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { logout } = useAuth();
  const { deactivate } = useProfileMutations();
  const [confirming, setConfirming] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function handleLogout() {
    await logout();
    navigate("/login");
  }

  async function handleDeactivate() {
    setError(null);
    try {
      await deactivate.mutateAsync({ password });
      navigate("/login");
    } catch (err) {
      const code = err instanceof ApiRequestError ? err.code : "INTERNAL_ERROR";
      setError(t(`errors.${code}`));
    }
  }

  return (
    <div className="flex gap-2">
      <Button variant="outline" className="flex-1" onClick={() => void handleLogout()}>
        {t("profile.danger.logout")}
      </Button>
      <Button
        variant="outline"
        className="flex-1 border-destructive/20 bg-destructive/15 text-destructive hover:bg-destructive/25"
        onClick={() => {
          setPassword("");
          setError(null);
          setConfirming(true);
        }}
      >
        {t("profile.danger.deactivate")}
      </Button>
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        onConfirm={() => void handleDeactivate()}
        title={t("profile.danger.confirmTitle")}
        description={t("profile.danger.confirmDescription")}
        confirmLabel={t("profile.danger.confirmButton")}
        loading={deactivate.isPending}
      >
        <Field
          label={t("profile.danger.passwordLabel")}
          htmlFor="deactivate-password"
          error={error}
        >
          <Input
            id="deactivate-password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            aria-label={t("profile.danger.passwordLabel")}
          />
        </Field>
      </ConfirmDialog>
    </div>
  );
}
