import { Check, Info } from "lucide-react";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import { Trans, useTranslation } from "react-i18next";

import { auth } from "@finance/contracts";

import { ApiRequestError } from "@finance/client";
import { cn } from "@finance/ui/src/shared/lib/cn";
import { formatRutInput } from "@finance/ui/src/shared/lib/formatRut";
import { Button } from "@finance/ui/src/shared/ui/button";
import { FormSelectField } from "../../../shared/ui/form";
import { useAuth } from "../hooks/useAuth";
import {
  PASSWORD_MIN_LENGTH,
  localIsoDate,
  parseLocalDate,
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

/** Top-to-bottom order of everything that can be wrong: where focus goes after a failed submit. */
const FOCUS_ORDER = [
  "name",
  "rut",
  "email",
  "password",
  "birthDate",
  "consent",
  "guardianName",
  "guardianRut",
  "guardianAccept",
] as const;
type Focusable = (typeof FOCUS_ORDER)[number];

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
  /** "That RUT already has an account" offers to sign in instead, with the RUT kept. */
  onSwitchToLogin?: () => void;
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
  onSwitchToLogin,
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
  // Taken by another account, as answered by the server — cleared as soon as the value changes.
  const [takenRut, setTakenRut] = useState<string | null>(null);
  const [takenEmail, setTakenEmail] = useState<string | null>(null);
  // Each focusable input, filled by its ref callback. A stable Map (not a ref read during
  // render): only the callbacks and the submit handler ever touch it.
  const [fieldEls] = useState(() => new Map<Focusable, HTMLInputElement | null>());
  const refFor = (key: Focusable) => (el: HTMLInputElement | null) => {
    fieldEls.set(key, el);
  };

  useEffect(() => {
    onBusyChange?.(busy);
  }, [busy, onBusyChange]);

  // Same threshold/computation the API validates against (auth.calculateAgeFromBirthDate) —
  // shown here purely to decide whether to reveal the guardian block, never trusted as the
  // actual gate (the server re-checks with its own clock regardless).
  const isMinor = useMemo(() => {
    if (!birthDate) return false;
    // Parsed as a LOCAL date: `new Date("2008-10-07")` is UTC midnight, which in Chile is still
    // the 6th, and would call someone 18 a day early.
    const date = parseLocalDate(birthDate);
    return date ? auth.calculateAgeFromBirthDate(date) < auth.MINOR_GUARDIAN_THRESHOLD_AGE : false;
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
      ref: refFor(field),
      onBlur: () => setTouched((prev) => ({ ...prev, [field]: true })),
      error: show ? t(`auth.validation.${code}`, { min: PASSWORD_MIN_LENGTH }) : null,
    };
  }

  const rutTaken = takenRut !== null && takenRut === identifierValue;
  const emailTaken = takenEmail !== null && takenEmail === email;
  const consentMissing = submitted && !sensitiveDataConsent;
  const guardianAcceptMissing = submitted && isMinor && !guardianAccepted;

  /** The first thing currently wrong, in screen order. */
  function firstProblem(): Focusable | null {
    const wrong: Record<Focusable, boolean> = {
      name: Boolean(errors.name),
      rut: Boolean(errors.rut) || rutTaken,
      email: Boolean(errors.email) || emailTaken,
      password: Boolean(errors.password),
      birthDate: Boolean(errors.birthDate),
      consent: !sensitiveDataConsent,
      guardianName: Boolean(errors.guardianName),
      guardianRut: Boolean(errors.guardianRut),
      guardianAccept: isMinor && !guardianAccepted,
    };
    return FOCUS_ORDER.find((key) => wrong[key]) ?? null;
  }

  // The submit button lives in the panel's footer, so a problem above the fold would otherwise
  // go unseen: focusing it also scrolls it into view.
  function focusProblem(key: Focusable) {
    fieldEls.get(key)?.focus();
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitted(true);
    const problem = firstProblem();
    if (problem) {
      focusProblem(problem);
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
      // A taken RUT/email belongs to its field, not to a message at the bottom.
      if (code === "IDENTIFIER_TAKEN") {
        setTakenRut(identifierValue);
        focusProblem("rut");
      } else if (code === "EMAIL_TAKEN") {
        setTakenEmail(email);
        focusProblem("email");
      } else {
        setError(t(`errors.${code}`));
      }
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
        {...(rutTaken
          ? {
              error: (
                <>
                  {t("auth.signup.rutTaken")}{" "}
                  {onSwitchToLogin ? (
                    <button
                      type="button"
                      onClick={onSwitchToLogin}
                      className="font-semibold text-primary hover:underline"
                    >
                      {t("auth.signIn")} →
                    </button>
                  ) : null}
                </>
              ),
            }
          : {})}
        valid={!errors.rut && !rutTaken}
        placeholder={t("auth.placeholders.rut")}
        autoComplete="username"
        numeric
      />
      <UnderlineField
        label={t("auth.email")}
        value={email}
        onChange={setEmail}
        {...fieldProps("email")}
        {...(emailTaken ? { error: t("auth.signup.emailTaken") } : {})}
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
          <Rule ok={Boolean(password) && rules.notRut}>{t("auth.passwordRules.notRut")}</Rule>
        </ul>
        {/* A suggestion, not a rule: kept out of the checklist so it never reads as missing. */}
        {rules.symbol ? null : (
          <p className="flex items-center gap-1.5 text-xs text-dim">
            <Info className="size-3.5 shrink-0" aria-hidden />
            {t("auth.passwordRules.symbolHint")}
          </p>
        )}
      </div>
      <UnderlineField
        label={t("auth.birthDate")}
        value={birthDate}
        onChange={setBirthDate}
        {...fieldProps("birthDate")}
        type="date"
        max={localIsoDate(new Date())}
        autoComplete="bday"
        numeric
      />

      <CheckCard
        title={t("auth.sensitiveDataConsentLabel")}
        checked={sensitiveDataConsent}
        onChange={setSensitiveDataConsent}
        error={consentMissing ? t("auth.consentRequired") : null}
        ref={refFor("consent")}
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
            error={guardianAcceptMissing ? t("auth.guardian.acceptRequired") : null}
            ref={refFor("guardianAccept")}
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
        <Button type="submit" size="lg" disabled={busy} className="w-full">
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
