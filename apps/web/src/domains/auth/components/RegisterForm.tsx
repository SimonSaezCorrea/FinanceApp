import { Check } from "lucide-react";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import { Trans, useTranslation } from "react-i18next";

import { auth } from "@finance/contracts";

import { ApiRequestError } from "../../../shared/lib/apiClient";
import { cn } from "../../../shared/lib/cn";
import { formatRutInput } from "../../../shared/lib/formatRut";
import { Button } from "../../../shared/ui/button";
import { FormSelectField } from "../../../shared/ui/form";
import { useAuth } from "../hooks/useAuth";
import {
  PASSWORD_MIN_LENGTH,
  type ValidationError,
  passwordRules,
  validateBirthDate,
  validateEmail,
  validateNewPassword,
  validateRequired,
  validateRut,
} from "../lib/validation";
import { CheckCard } from "./CheckCard";
import { UnderlineField } from "./UnderlineField";

const GUARDIAN_RELATIONSHIP_OPTIONS: { value: auth.GuardianAuthorization["relationship"] }[] = [
  { value: "MOTHER" },
  { value: "FATHER" },
  { value: "GUARDIAN" },
  { value: "OTHER" },
];

type Field = "name" | "rut" | "email" | "password" | "birthDate" | "guardianName" | "guardianRut";

interface RegisterFormProps {
  /** Called after a successful registration (the session is already set at that point). */
  onSuccess: () => void;
  /** Optional controlled RUT, shared with the login view of the access panel. */
  identifierValue?: string;
  onIdentifierValueChange?: (value: string) => void;
  /** When set, the form renders no submit button of its own: the host pins one in its footer
   * with `form={formId}`, and follows `onBusyChange` to label it while the request runs. */
  formId?: string;
  onBusyChange?: (busy: boolean) => void;
}

/** Sign-up: underline fields, the password's rules checked live as it's typed, and the
 * reinforced consent as an explicit checkbox card. Each field validates on blur (everything on
 * submit) with the same rules the API applies. */
export function RegisterForm({
  onSuccess,
  identifierValue: controlledRut,
  onIdentifierValueChange,
  formId,
  onBusyChange,
}: Readonly<RegisterFormProps>) {
  const { t } = useTranslation();
  const { register } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [localRut, setLocalRut] = useState("");
  const identifierValue = controlledRut ?? localRut;
  const setIdentifierValue = onIdentifierValueChange ?? setLocalRut;
  const [birthDate, setBirthDate] = useState("");
  const [sensitiveDataConsent, setSensitiveDataConsent] = useState(false);
  const [guardianName, setGuardianName] = useState("");
  const [guardianIdentifierValue, setGuardianIdentifierValue] = useState("");
  const [guardianRelationship, setGuardianRelationship] =
    useState<auth.GuardianAuthorization["relationship"]>("MOTHER");
  const [guardianAccepted, setGuardianAccepted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [touched, setTouched] = useState<Partial<Record<Field, boolean>>>({});
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    onBusyChange?.(busy);
  }, [busy, onBusyChange]);

  // Same threshold/computation the API validates against (auth.calculateAgeFromBirthDate) —
  // shown here purely to decide whether to reveal the guardian block, never trusted as the
  // actual gate (the server re-checks with its own clock regardless).
  const isMinor = useMemo(() => {
    if (!birthDate) return false;
    return auth.calculateAgeFromBirthDate(new Date(birthDate)) < auth.MINOR_GUARDIAN_THRESHOLD_AGE;
  }, [birthDate]);

  const rules = passwordRules(password, identifierValue);
  const errors: Record<Field, ValidationError | null> = {
    name: validateRequired(name),
    rut: validateRut(identifierValue),
    email: validateEmail(email),
    password: validateNewPassword(password, identifierValue),
    birthDate: validateBirthDate(birthDate),
    guardianName: isMinor ? validateRequired(guardianName) : null,
    guardianRut: isMinor ? validateRut(guardianIdentifierValue) : null,
  };

  // A malformed value shows once the field is left; "required" only after a submit attempt.
  function fieldProps(field: Field) {
    const code = errors[field];
    const show = code && (submitted || (touched[field] && code !== "required"));
    return {
      onBlur: () => setTouched((prev) => ({ ...prev, [field]: true })),
      error: show ? t(`auth.validation.${code}`, { min: PASSWORD_MIN_LENGTH }) : null,
    };
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitted(true);
    if (Object.values(errors).some(Boolean)) return;
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
        name: name.trim(),
        email: email.trim(),
        password,
        identifierValue,
        birthDate: new Date(birthDate),
        sensitiveDataConsent: sensitiveDataConsent as true,
        guardianAuthorization: isMinor
          ? {
              name: guardianName.trim(),
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
    <form id={formId} className="flex flex-col gap-5" onSubmit={onSubmit} noValidate>
      <div className="flex flex-col gap-1.5">
        <h2 className="text-2xl font-bold tracking-tight">{t("auth.signup.title")}</h2>
        <p className="text-sm text-muted-foreground">{t("auth.signup.subtitle")}</p>
      </div>

      <UnderlineField
        label={t("auth.name")}
        value={name}
        onChange={setName}
        {...fieldProps("name")}
        placeholder={t("auth.placeholders.name")}
        autoComplete="name"
        autoFocus
      />
      <UnderlineField
        label={t("auth.rut")}
        value={identifierValue}
        onChange={(v) => setIdentifierValue(formatRutInput(v))}
        {...fieldProps("rut")}
        valid={!errors.rut}
        placeholder={t("auth.placeholders.rut")}
        autoComplete="username"
        numeric
      />
      <UnderlineField
        label={t("auth.email")}
        value={email}
        onChange={setEmail}
        {...fieldProps("email")}
        type="email"
        inputMode="email"
        placeholder={t("auth.placeholders.email")}
        autoComplete="email"
      />
      <div className="flex flex-col gap-3">
        <UnderlineField
          label={t("auth.password")}
          value={password}
          onChange={setPassword}
          {...fieldProps("password")}
          type="password"
          placeholder={t("auth.placeholders.password")}
          autoComplete="new-password"
        />
        <ul
          className="grid grid-cols-1 gap-2 sm:grid-cols-2"
          aria-label={t("auth.passwordRules.label")}
        >
          <Rule ok={rules.length}>
            {t("auth.passwordRules.length", { min: PASSWORD_MIN_LENGTH })}
          </Rule>
          <Rule ok={rules.letterNumber}>{t("auth.passwordRules.letterNumber")}</Rule>
          <Rule ok={rules.symbol}>{t("auth.passwordRules.symbol")}</Rule>
          <Rule ok={Boolean(password) && rules.notRut}>{t("auth.passwordRules.notRut")}</Rule>
        </ul>
      </div>
      <UnderlineField
        label={t("auth.birthDate")}
        value={birthDate}
        onChange={setBirthDate}
        {...fieldProps("birthDate")}
        type="date"
        max={new Date().toISOString().slice(0, 10)}
        autoComplete="bday"
        numeric
      />

      <CheckCard
        title={t("auth.sensitiveDataConsentLabel")}
        checked={sensitiveDataConsent}
        onChange={setSensitiveDataConsent}
      >
        <Trans
          i18nKey="auth.sensitiveDataConsent"
          components={{
            privacy: (
              // A new tab: following it in place would throw away the half-filled form.
              <a
                href="/privacidad"
                target="_blank"
                rel="noreferrer"
                className="font-medium text-primary underline-offset-2 hover:underline"
              />
            ),
          }}
        />
      </CheckCard>

      {isMinor ? (
        <div className="flex flex-col gap-4 rounded-xl border border-border bg-muted/30 p-4">
          <div>
            <p className="text-sm font-semibold">{t("auth.guardian.title")}</p>
            <p className="mt-1 text-xs text-muted-foreground">{t("auth.guardian.hint")}</p>
          </div>
          <UnderlineField
            label={t("auth.guardian.name")}
            value={guardianName}
            onChange={setGuardianName}
            {...fieldProps("guardianName")}
            placeholder={t("auth.placeholders.guardianName")}
          />
          <UnderlineField
            label={t("auth.guardian.identifierValue")}
            value={guardianIdentifierValue}
            onChange={(v) => setGuardianIdentifierValue(formatRutInput(v))}
            {...fieldProps("guardianRut")}
            valid={!errors.guardianRut}
            placeholder={t("auth.placeholders.guardianRut")}
            numeric
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
          <CheckCard
            title={t("auth.guardian.acceptLabel")}
            checked={guardianAccepted}
            onChange={setGuardianAccepted}
          >
            {t("auth.guardian.accept")}
          </CheckCard>
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      {formId ? null : (
        <Button type="submit" variant="accent" size="lg" disabled={busy} className="w-full">
          {busy ? t("auth.creatingAccount") : t("auth.createAccount")}
        </Button>
      )}
    </form>
  );
}

function Rule({ ok, children }: Readonly<{ ok: boolean; children: string }>) {
  const { t } = useTranslation();
  return (
    <li
      className={cn(
        "flex items-center gap-2 text-[13px]",
        ok ? "text-foreground" : "text-muted-foreground",
      )}
    >
      {ok ? (
        <Check className="size-3.5 shrink-0 text-success" strokeWidth={3} aria-hidden />
      ) : (
        <span className="size-3.5 shrink-0 rounded-full border-[1.5px] border-dim" aria-hidden />
      )}
      <span>
        {children}
        <span className="sr-only">
          {" · "}
          {ok ? t("auth.passwordRules.met") : t("auth.passwordRules.pending")}
        </span>
      </span>
    </li>
  );
}
