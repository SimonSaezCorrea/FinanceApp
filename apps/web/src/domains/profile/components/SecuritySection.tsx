import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Eye, EyeOff, Laptop, Smartphone } from "lucide-react";
import { toast } from "sonner";

import { useAuth } from "../../auth/hooks/useAuth";
import { ApiRequestError } from "../../../shared/lib/apiClient";
import { cn } from "../../../shared/lib/cn";
import { Badge } from "../../../shared/ui/badge";
import { Button } from "../../../shared/ui/button";
import { CollapsibleSection } from "../../../shared/ui/collapsible-section";
import { ConfirmModal, FormSurface } from "../../../shared/ui/overlay";
import { Field } from "../../../shared/ui/field";
import { FormNotice } from "../../../shared/ui/form/FormNotice";
import { Input } from "../../../shared/ui/input";
import { Switch } from "../../../shared/ui/switch";
import { usePasskeysQuery, useProfileMutations, useSessionsQuery } from "../hooks/useProfile";
import { MfaEnrollmentPanel } from "./MfaEnrollmentPanel";
import { PasskeySection } from "./PasskeySection";

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
        <FormNotice tone="warning">{t("profile.security.sessions.revokeOthersWarning")}</FormNotice>
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

function DisableMfaModal({
  open,
  onOpenChange,
}: Readonly<{ open: boolean; onOpenChange: (open: boolean) => void }>) {
  const { t } = useTranslation();
  const { disableMfa } = useProfileMutations();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  function close(next: boolean) {
    if (!next) {
      setPassword("");
      setError(null);
    }
    onOpenChange(next);
  }

  async function handleDisable() {
    setError(null);
    try {
      await disableMfa.mutateAsync({ password });
      close(false);
    } catch (err) {
      const code = err instanceof ApiRequestError ? err.code : "INTERNAL_ERROR";
      setError(t(`errors.${code}`));
    }
  }

  return (
    <ConfirmModal
      open={open}
      onOpenChange={close}
      onConfirm={() => void handleDisable()}
      title={t("profile.security.mfa.disableTitle")}
      description={t("profile.security.mfa.disableHint")}
      confirmLabel={t("profile.security.mfa.disableConfirm")}
      loading={disableMfa.isPending}
    >
      <div className="flex flex-col gap-4">
        <FormNotice tone="warning">{t("profile.security.sessions.revokeOthersWarning")}</FormNotice>
        <Field
          label={t("profile.security.mfa.disablePasswordLabel")}
          htmlFor="mfa-disable-password"
          error={error}
        >
          <Input
            id="mfa-disable-password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
      </div>
    </ConfirmModal>
  );
}

/** A device-shaped icon from a session's `deviceLabel` — a lightweight guess (phone
 * OSes vs. everything else), not a real device-type field. */
function sessionIcon(deviceLabel: string | null) {
  const label = deviceLabel?.toLowerCase() ?? "";
  return label.includes("iphone") || label.includes("android") ? Smartphone : Laptop;
}

/** "Santiago, Chile" from a session's raw `city`/`country` (ISO alpha-2) — the country
 * NAME is derived client-side via `Intl.DisplayNames` (no extra data from the API,
 * every browser already ships this) rather than stored, so it localizes for free and
 * a locale switch never needs a backend round-trip. Falls back to the raw code if the
 * runtime can't resolve it (unknown/malformed code). */
function formatLocation(
  country: string | null,
  city: string | null,
  locale: string,
): string | null {
  if (!country) return city;
  let countryName = country;
  try {
    countryName = new Intl.DisplayNames([locale], { type: "region" }).of(country) ?? country;
  } catch {
    // Unsupported locale/region — show the raw ISO code instead of crashing.
  }
  return city ? `${city}, ${countryName}` : countryName;
}

/** Day + hour:minute, localized — used for both "última actividad" and "cerrada el",
 * so a session's timeline reads precisely instead of just "today". */
function formatDateTime(iso: string, locale: string): string {
  const date = new Date(iso);
  const day = date.toLocaleDateString(locale);
  const time = date.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
  return `${day} ${time}`;
}

export function SecuritySection() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const [changingPassword, setChangingPassword] = useState(false);
  const [enrollingMfa, setEnrollingMfa] = useState(false);
  const [disablingMfa, setDisablingMfa] = useState(false);
  const [managingPasskeys, setManagingPasskeys] = useState(false);
  const mfaEnabled = user?.mfaEnabled ?? false;
  const { data: passkeys } = usePasskeysQuery();
  const passkeyCount = passkeys?.length ?? 0;
  const { data: sessions, isLoading: sessionsLoading } = useSessionsQuery();
  const { closeSession, revokeOtherSessions } = useProfileMutations();
  const sessionList = sessions ?? [];
  const openSessionCount = sessionList.filter((s) => !s.closedAt).length;

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
            {mfaEnabled
              ? t("profile.security.mfa.enabledHint", {
                  count: user?.mfaRecoveryCodesRemaining ?? 0,
                })
              : t("profile.security.twoFactor.hint")}
          </div>
        </div>
        <Switch
          checked={mfaEnabled}
          onCheckedChange={(checked) => {
            if (checked) setEnrollingMfa(true);
            else setDisablingMfa(true);
          }}
          aria-label={t("profile.security.twoFactor.label")}
        />
      </div>
      <div className="flex items-center justify-between border-b py-3">
        <div>
          <div className="flex items-center gap-2 text-sm">
            {t("profile.security.passkey.label")}
            {passkeyCount > 0 ? (
              <Badge variant="success">
                {t("profile.security.passkey.countBadge", { count: passkeyCount })}
              </Badge>
            ) : null}
          </div>
          <div className="text-xs text-muted-foreground">{t("profile.security.passkey.hint")}</div>
        </div>
        <Button variant="outline" size="sm" onClick={() => setManagingPasskeys(true)}>
          {t("profile.security.passkey.configure")}
        </Button>
      </div>
      <div className="pt-3">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs font-medium text-muted-foreground">
            {t("profile.security.sessions.title")}
          </span>
          {openSessionCount > 1 ? (
            <button
              type="button"
              className="text-xs font-medium text-destructive disabled:opacity-60"
              disabled={revokeOtherSessions.isPending}
              onClick={() => revokeOtherSessions.mutate()}
            >
              {t("profile.security.sessions.closeAll")}
            </button>
          ) : null}
        </div>
        <div className="overflow-hidden rounded-lg border">
          {sessionsLoading ? (
            <p className="px-3.5 py-2.5 text-xs text-muted-foreground">
              {t("profile.security.sessions.loading")}
            </p>
          ) : (
            sessionList.map((s, i) => {
              const Icon = sessionIcon(s.deviceLabel);
              const label = s.deviceLabel ?? t("profile.security.sessions.unknownDevice");
              const location = formatLocation(s.country, s.city, i18n.language);
              const meta = s.closedAt
                ? [
                    location ?? t("profile.security.sessions.unknownLocation"),
                    t("profile.security.sessions.closed", {
                      date: formatDateTime(s.closedAt, i18n.language),
                    }),
                  ].join(" · ")
                : s.isCurrent
                  ? [t("profile.security.sessions.thisDevice"), location]
                      .filter(Boolean)
                      .join(" · ")
                  : [
                      location ?? t("profile.security.sessions.unknownLocation"),
                      t("profile.security.sessions.lastActive", {
                        date: formatDateTime(s.lastUsedAt, i18n.language),
                      }),
                    ].join(" · ");
              return (
                <div key={s.id} className={cnRow(i, sessionList.length, s.closedAt !== null)}>
                  <Icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-medium">{label}</div>
                    <div
                      className={
                        s.isCurrent && !s.closedAt
                          ? "text-[11px] text-success"
                          : "text-[11px] text-muted-foreground"
                      }
                    >
                      {meta}
                    </div>
                  </div>
                  {s.isCurrent || s.closedAt ? null : (
                    <button
                      type="button"
                      className="text-[11px] font-medium text-destructive disabled:opacity-60"
                      disabled={closeSession.isPending}
                      onClick={() => closeSession.mutate(s.id)}
                    >
                      {t("profile.security.sessions.close")}
                    </button>
                  )}
                </div>
              );
            })
          )}
          {!sessionsLoading && sessionList.length === 0 ? (
            <p className="px-3.5 py-2.5 text-xs text-muted-foreground">
              {t("profile.security.sessions.empty")}
            </p>
          ) : null}
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">
          {t("profile.security.sessions.attribution")}{" "}
          <a href="https://ipinfo.io" target="_blank" rel="noreferrer" className="underline">
            IPinfo
          </a>
        </p>
      </div>
      <ChangePasswordDialog open={changingPassword} onOpenChange={setChangingPassword} />
      <MfaEnrollmentPanel open={enrollingMfa} onOpenChange={setEnrollingMfa} />
      <DisableMfaModal open={disablingMfa} onOpenChange={setDisablingMfa} />
      <PasskeySection open={managingPasskeys} onOpenChange={setManagingPasskeys} />
    </CollapsibleSection>
  );
}

function cnRow(index: number, total: number, closed = false): string {
  const base = "flex items-center gap-3 px-3.5 py-2.5";
  const withBorder = index < total - 1 ? `${base} border-b` : base;
  return closed ? `${withBorder} opacity-60` : withBorder;
}
