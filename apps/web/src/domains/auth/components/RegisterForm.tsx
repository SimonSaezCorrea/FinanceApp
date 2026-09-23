import { type FormEvent, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { auth } from "@finance/contracts";

import { ApiRequestError } from "../../../shared/lib/apiClient";
import { formatRutInput } from "../../../shared/lib/formatRut";
import { Button } from "../../../shared/ui/button";
import {
  FormNotice,
  FormSelectField,
  FormSwitchField,
  FormTextField,
} from "../../../shared/ui/form";
import { useAuth } from "../hooks/useAuth";

const GUARDIAN_RELATIONSHIP_OPTIONS: { value: auth.GuardianAuthorization["relationship"] }[] = [
  { value: "MOTHER" },
  { value: "FATHER" },
  { value: "GUARDIAN" },
  { value: "OTHER" },
];

interface RegisterFormProps {
  /** Called after a successful registration (the session is already set at that point) — the
   * two hosts (the standalone `/register` page, the side panel opened from `LoginRoute`) each
   * decide what happens next (navigate, close the panel) rather than this form owning either. */
  onSuccess: () => void;
  className?: string;
}

/** The actual registration form — shared by the standalone `/register` route (direct
 * navigation, bookmarks, password-manager autofill) and the side panel `LoginRoute` opens for
 * "Registrarse" (same content, no full navigation away from the login screen). Built from the
 * same label/value row primitives (`shared/ui/form`) every other form in the app uses — a row
 * per field, thin dividers, no boxed inputs — instead of a plain stack of bordered `<Input>`s. */
export function RegisterForm({ onSuccess, className }: Readonly<RegisterFormProps>) {
  const { t } = useTranslation();
  const { register } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [identifierValue, setIdentifierValue] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [sensitiveDataConsent, setSensitiveDataConsent] = useState(false);
  const [guardianName, setGuardianName] = useState("");
  const [guardianIdentifierValue, setGuardianIdentifierValue] = useState("");
  const [guardianRelationship, setGuardianRelationship] =
    useState<auth.GuardianAuthorization["relationship"]>("MOTHER");
  const [guardianAccepted, setGuardianAccepted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Same threshold/computation the API validates against (auth.calculateAgeFromBirthDate) —
  // shown here purely to decide whether to reveal the guardian block, never trusted as the
  // actual gate (the server re-checks with its own clock regardless).
  const isMinor = useMemo(() => {
    if (!birthDate) return false;
    return auth.calculateAgeFromBirthDate(new Date(birthDate)) < auth.MINOR_GUARDIAN_THRESHOLD_AGE;
  }, [birthDate]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    // The consent/authorization switches aren't real form controls (unlike the old checkboxes,
    // a `Switch` is a button), so the browser's own `required` can't block submission for
    // them — checked by hand instead.
    if (!sensitiveDataConsent) {
      setError(t("auth.consentRequired"));
      return;
    }
    if (isMinor && !guardianAccepted) {
      setError(t("auth.guardian.acceptRequired"));
      return;
    }
    setBusy(true);
    try {
      await register({
        name,
        email,
        password,
        identifierValue,
        birthDate: new Date(birthDate),
        sensitiveDataConsent: sensitiveDataConsent as true,
        guardianAuthorization: isMinor
          ? {
              name: guardianName,
              identifierValue: guardianIdentifierValue,
              relationship: guardianRelationship,
              accepted: guardianAccepted as true,
            }
          : undefined,
      });
      onSuccess();
    } catch (err) {
      const code = err instanceof ApiRequestError ? err.code : "INTERNAL_ERROR";
      setError(t(`errors.${code}`));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className={className ?? "flex flex-col gap-1"} onSubmit={onSubmit}>
      <FormTextField
        label={t("auth.name")}
        value={name}
        onChange={setName}
        placeholder={t("auth.placeholders.name")}
        required
        autoComplete="name"
      />
      <FormTextField
        label={t("auth.rut")}
        value={identifierValue}
        onChange={(v) => setIdentifierValue(formatRutInput(v))}
        placeholder={t("auth.placeholders.rut")}
        required
        autoComplete="username"
      />
      <FormTextField
        label={t("auth.email")}
        value={email}
        onChange={setEmail}
        type="email"
        placeholder={t("auth.placeholders.email")}
        required
        autoComplete="email"
      />
      <FormTextField
        label={t("auth.password")}
        value={password}
        onChange={setPassword}
        type="password"
        placeholder={t("auth.placeholders.password")}
        required
        minLength={8}
        autoComplete="new-password"
      />
      <FormTextField
        label={t("auth.birthDate")}
        value={birthDate}
        onChange={setBirthDate}
        type="date"
        required
      />

      <div className="py-3">
        <FormSwitchField
          label={t("auth.sensitiveDataConsentLabel")}
          checked={sensitiveDataConsent}
          onChange={setSensitiveDataConsent}
        />
        <FormNotice className="mt-2">{t("auth.sensitiveDataConsent")}</FormNotice>
      </div>

      {isMinor ? (
        <div className="flex flex-col gap-1 rounded-lg border border-border bg-muted/30 p-3">
          <p className="mb-1 text-xs font-semibold">{t("auth.guardian.title")}</p>
          <p className="mb-2 text-[11px] text-muted-foreground">{t("auth.guardian.hint")}</p>
          <FormTextField
            label={t("auth.guardian.name")}
            value={guardianName}
            onChange={setGuardianName}
            placeholder={t("auth.placeholders.guardianName")}
            required
          />
          <FormTextField
            label={t("auth.guardian.identifierValue")}
            value={guardianIdentifierValue}
            onChange={(v) => setGuardianIdentifierValue(formatRutInput(v))}
            placeholder={t("auth.placeholders.guardianRut")}
            required
          />
          <FormSelectField
            label={t("auth.guardian.relationshipLabel")}
            value={guardianRelationship}
            onChange={(v) =>
              setGuardianRelationship(v as auth.GuardianAuthorization["relationship"])
            }
            options={GUARDIAN_RELATIONSHIP_OPTIONS.map((o) => ({
              value: o.value,
              label: t(`auth.guardian.relationship.${o.value}`),
            }))}
          />
          <div className="py-3">
            <FormSwitchField
              label={t("auth.guardian.acceptLabel")}
              checked={guardianAccepted}
              onChange={setGuardianAccepted}
            />
            <FormNotice className="mt-2">{t("auth.guardian.accept")}</FormNotice>
          </div>
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="pt-3 text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <Button type="submit" disabled={busy} className="mt-4 w-full">
        {t("auth.createAccount")}
      </Button>
    </form>
  );
}
