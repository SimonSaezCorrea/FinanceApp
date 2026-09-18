import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Eye, EyeOff, Laptop, Smartphone } from "lucide-react";
import { toast } from "sonner";

import { ApiRequestError } from "../../../shared/lib/apiClient";
import { cn } from "../../../shared/lib/cn";
import { Button } from "../../../shared/ui/button";
import { CollapsibleSection } from "../../../shared/ui/collapsible-section";
import { FormSurface } from "../../../shared/ui/overlay";
import { Field } from "../../../shared/ui/field";
import { Input } from "../../../shared/ui/input";
import { Switch } from "../../../shared/ui/switch";
import { useProfileMutations } from "../hooks/useProfile";

/** A password input with a show/hide toggle — the eye icon reveals it
 * temporarily, same interaction language `MaskedAmount` already uses for
 * balances elsewhere in the profile. */
function PasswordField({
  id,
  label,
  autoComplete,
  value,
  onChange,
  error,
  toggleLabel,
}: Readonly<{
  id: string;
  label: string;
  autoComplete: "current-password" | "new-password";
  value: string;
  onChange: (value: string) => void;
  error?: string | null;
  toggleLabel: string;
}>) {
  const [show, setShow] = useState(false);
  return (
    <Field label={label} htmlFor={id} error={error}>
      <div className="relative">
        <Input
          id={id}
          type={show ? "text" : "password"}
          autoComplete={autoComplete}
          value={value}
          required
          onChange={(e) => onChange(e.target.value)}
          className={cn("pr-10", error && "border-destructive")}
        />
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          aria-label={toggleLabel}
          aria-pressed={show}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          {show ? (
            <EyeOff className="h-4 w-4" aria-hidden />
          ) : (
            <Eye className="h-4 w-4" aria-hidden />
          )}
        </button>
      </div>
    </Field>
  );
}

/** A single live requirement/match hint under a password field — muted while
 * unmet, success-toned once satisfied. Only the rule the backend actually
 * enforces (min 8 chars) is shown; no invented strength rules. */
function PasswordHint({ ok, label }: Readonly<{ ok: boolean; label: string }>) {
  return (
    <p className={cn("mt-1.5 text-xs", ok ? "text-success" : "text-muted-foreground")}>{label}</p>
  );
}

function ChangePasswordDialog({
  open,
  onOpenChange,
}: Readonly<{ open: boolean; onOpenChange: (open: boolean) => void }>) {
  const { t } = useTranslation();
  const { changePassword } = useProfileMutations();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [currentError, setCurrentError] = useState<string | null>(null);

  const lengthOk = newPassword.length >= 8;
  const hasConfirm = confirmPassword.length > 0;
  const matchOk = hasConfirm && confirmPassword === newPassword;
  const canSubmit = currentPassword.length > 0 && lengthOk && matchOk;

  function reset() {
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setCurrentError(null);
  }

  function close(next: boolean) {
    if (!next) reset();
    onOpenChange(next);
  }

  async function handleSubmit() {
    setCurrentError(null);
    try {
      await changePassword.mutateAsync({ currentPassword, newPassword });
      toast.success(t("profile.security.password.updated"));
      close(false);
    } catch (err) {
      const code = err instanceof ApiRequestError ? err.code : "INTERNAL_ERROR";
      // INVALID_CURRENT_PASSWORD is about the CURRENT password field — anchor
      // it there instead of showing it under the new one (the old bug).
      if (code === "INVALID_CURRENT_PASSWORD") {
        setCurrentError(t(`errors.${code}`));
      } else {
        toast.error(t(`errors.${code}`, { defaultValue: t("errors.INTERNAL_ERROR") }));
      }
    }
  }

  return (
    <FormSurface
      open={open}
      onOpenChange={close}
      mode="edit"
      surface="panel"
      eyebrow={t("profile.security.title")}
      title={t("profile.security.password.change")}
      description={t("profile.security.password.hint8")}
      submitLabel={t("profile.security.password.save")}
      onSubmit={handleSubmit}
      canSubmit={canSubmit}
      submitting={changePassword.isPending}
    >
      <div className="flex flex-col gap-5">
        <PasswordField
          id="current-password"
          label={t("profile.security.password.current")}
          autoComplete="current-password"
          value={currentPassword}
          onChange={setCurrentPassword}
          error={currentError}
          toggleLabel={t("profile.security.password.toggleCurrent")}
        />
        <div>
          <PasswordField
            id="new-password"
            label={t("profile.security.password.new")}
            autoComplete="new-password"
            value={newPassword}
            onChange={setNewPassword}
            toggleLabel={t("profile.security.password.toggleNew")}
          />
          <PasswordHint ok={lengthOk} label={t("profile.security.password.minLength")} />
        </div>
        <div>
          <PasswordField
            id="confirm-password"
            label={t("profile.security.password.confirm")}
            autoComplete="new-password"
            value={confirmPassword}
            onChange={setConfirmPassword}
            toggleLabel={t("profile.security.password.toggleConfirm")}
          />
          {hasConfirm ? (
            <PasswordHint
              ok={matchOk}
              label={t(
                matchOk
                  ? "profile.security.password.matchOk"
                  : "profile.security.password.matchMismatch",
              )}
            />
          ) : null}
        </div>
      </div>
    </FormSurface>
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
