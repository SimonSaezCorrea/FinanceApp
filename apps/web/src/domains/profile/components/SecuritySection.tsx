import { type FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { Laptop, Smartphone } from "lucide-react";

import { ApiRequestError } from "../../../shared/lib/apiClient";
import { Button } from "../../../shared/ui/button";
import { CollapsibleSection } from "../../../shared/ui/collapsible-section";
import { Dialog } from "../../../shared/ui/dialog";
import { Field } from "../../../shared/ui/field";
import { Input } from "../../../shared/ui/input";
import { Switch } from "../../../shared/ui/switch";
import { useProfileMutations } from "../hooks/useProfile";

function ChangePasswordDialog({
  open,
  onOpenChange,
}: Readonly<{ open: boolean; onOpenChange: (open: boolean) => void }>) {
  const { t } = useTranslation();
  const { changePassword } = useProfileMutations();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await changePassword.mutateAsync({ currentPassword, newPassword });
      setCurrentPassword("");
      setNewPassword("");
      onOpenChange(false);
    } catch (err) {
      const code = err instanceof ApiRequestError ? err.code : "INTERNAL_ERROR";
      setError(t(`errors.${code}`));
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={t("profile.security.password.change")}>
      <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
        <Field label={t("profile.security.password.current")} htmlFor="current-password">
          <Input
            id="current-password"
            type="password"
            autoComplete="current-password"
            value={currentPassword}
            required
            onChange={(e) => setCurrentPassword(e.target.value)}
          />
        </Field>
        <Field label={t("profile.security.password.new")} htmlFor="new-password" error={error}>
          <Input
            id="new-password"
            type="password"
            autoComplete="new-password"
            value={newPassword}
            required
            minLength={8}
            onChange={(e) => setNewPassword(e.target.value)}
          />
        </Field>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t("profile.edit.cancel")}
          </Button>
          <Button type="submit" disabled={changePassword.isPending}>
            {t("profile.security.password.save")}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

interface Session {
  id: string;
  device: string;
  detail: string;
  current?: boolean;
}

// Placeholder data (PENDING.md: no real session/device tracking exists yet — see that doc).
const EXAMPLE_SESSIONS: Session[] = [
  { id: "s1", device: "MacBook Pro", detail: "Santiago", current: true },
  { id: "s2", device: "iPhone 15", detail: "Hace 2 h · Santiago" },
  { id: "s3", device: "Chrome · Windows", detail: "Ayer · Valparaíso" },
];

export function SecuritySection() {
  const { t } = useTranslation();
  const [changingPassword, setChangingPassword] = useState(false);
  // Local-only — no backend capability exists yet (FR-008); never persisted.
  const [twoFactor, setTwoFactor] = useState(false);
  // Placeholder — local UI state only, no real session revocation (see PENDING.md).
  const [sessions, setSessions] = useState(EXAMPLE_SESSIONS);

  return (
    <CollapsibleSection title={t("profile.security.title")}>
      <div className="flex items-center justify-between border-b py-3">
        <div>
          <div className="text-sm">{t("profile.security.password.label")}</div>
          <div className="text-xs text-muted-foreground">{t("profile.security.password.hint")}</div>
        </div>
        <Button variant="outline" size="sm" onClick={() => setChangingPassword(true)}>
          {t("profile.security.password.change")}
        </Button>
      </div>
      <div className="flex items-center justify-between border-b py-3">
        <div>
          <div className="text-sm">{t("profile.security.twoFactor.label")}</div>
          <div className="text-xs text-muted-foreground">
            {t("profile.security.twoFactor.hint")}
          </div>
        </div>
        <Switch
          checked={twoFactor}
          onCheckedChange={setTwoFactor}
          aria-label={t("profile.security.twoFactor.label")}
        />
      </div>
      <div className="flex items-center justify-between border-b py-3">
        <div>
          <div className="text-sm">{t("profile.security.passkey.label")}</div>
          <div className="text-xs text-muted-foreground">{t("profile.security.passkey.hint")}</div>
        </div>
        <Button variant="outline" size="sm" disabled title={t("profile.comingSoon")}>
          {t("profile.security.passkey.configure")}
        </Button>
      </div>
      <div className="pt-3">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs font-medium text-muted-foreground">
            {t("profile.security.sessions.title")}
          </span>
          {sessions.length > 1 ? (
            <button
              type="button"
              className="text-xs font-medium text-destructive"
              onClick={() => setSessions((prev) => prev.filter((s) => s.current))}
            >
              {t("profile.security.sessions.closeAll")}
            </button>
          ) : null}
        </div>
        <div className="overflow-hidden rounded-lg border">
          {sessions.map((s, i) => {
            const Icon = s.device.toLowerCase().includes("iphone") ? Smartphone : Laptop;
            return (
              <div key={s.id} className={cnRow(i, sessions.length)}>
                <Icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-medium">{s.device}</div>
                  <div
                    className={
                      s.current ? "text-[11px] text-success" : "text-[11px] text-muted-foreground"
                    }
                  >
                    {s.current ? t("profile.security.sessions.thisDevice") : s.detail}
                  </div>
                </div>
                {s.current ? null : (
                  <button
                    type="button"
                    className="text-[11px] font-medium text-destructive"
                    onClick={() => setSessions((prev) => prev.filter((x) => x.id !== s.id))}
                  >
                    {t("profile.security.sessions.close")}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
      <ChangePasswordDialog open={changingPassword} onOpenChange={setChangingPassword} />
    </CollapsibleSection>
  );
}

function cnRow(index: number, total: number): string {
  const base = "flex items-center gap-3 px-3.5 py-2.5";
  return index < total - 1 ? `${base} border-b` : base;
}
