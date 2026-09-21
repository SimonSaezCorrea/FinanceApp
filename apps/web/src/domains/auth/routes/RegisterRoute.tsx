import { type FormEvent, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router";

import { auth } from "@finance/contracts";

import { ApiRequestError } from "../../../shared/lib/apiClient";
import { Button } from "../../../shared/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../../shared/ui/card";
import { Input } from "../../../shared/ui/input";
import { Select } from "../../../shared/ui/select";
import { ThemeToggle } from "../../../shared/ui/theme-toggle";
import { useAuth } from "../hooks/useAuth";

const GUARDIAN_RELATIONSHIP_OPTIONS: { value: auth.GuardianAuthorization["relationship"] }[] = [
  { value: "MOTHER" },
  { value: "FATHER" },
  { value: "GUARDIAN" },
  { value: "OTHER" },
];

export function RegisterRoute() {
  const { t } = useTranslation();
  const { register } = useAuth();
  const navigate = useNavigate();
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
    setBusy(true);
    setError(null);
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
      navigate("/");
    } catch (err) {
      const code = err instanceof ApiRequestError ? err.code : "INTERNAL_ERROR";
      setError(t(`errors.${code}`));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="relative flex min-h-dvh items-center justify-center bg-muted/30 p-4">
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>{t("auth.createAccount")}</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="flex flex-col gap-3" onSubmit={onSubmit}>
            <Input
              type="text"
              placeholder={t("auth.name")}
              value={name}
              required
              autoComplete="name"
              onChange={(e) => setName(e.target.value)}
            />
            <Input
              type="text"
              placeholder={t("auth.rut")}
              value={identifierValue}
              required
              autoComplete="username"
              onChange={(e) => setIdentifierValue(e.target.value)}
            />
            <Input
              type="email"
              placeholder={t("auth.email")}
              value={email}
              required
              autoComplete="email"
              onChange={(e) => setEmail(e.target.value)}
            />
            <Input
              type="password"
              placeholder={t("auth.password")}
              value={password}
              required
              minLength={8}
              autoComplete="new-password"
              onChange={(e) => setPassword(e.target.value)}
            />
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              {t("auth.birthDate")}
              <Input
                type="date"
                value={birthDate}
                required
                max={new Date().toISOString().slice(0, 10)}
                autoComplete="bday"
                onChange={(e) => setBirthDate(e.target.value)}
              />
            </label>
            <label className="flex items-start gap-2 text-xs text-muted-foreground">
              <input
                type="checkbox"
                required
                checked={sensitiveDataConsent}
                onChange={(e) => setSensitiveDataConsent(e.target.checked)}
                className="mt-0.5"
                aria-label={t("auth.sensitiveDataConsent")}
              />
              <span>{t("auth.sensitiveDataConsent")}</span>
            </label>
            {isMinor ? (
              <div className="flex flex-col gap-2 rounded-lg border border-border bg-muted/30 p-3">
                <p className="text-xs font-medium">{t("auth.guardian.title")}</p>
                <p className="text-[11px] text-muted-foreground">{t("auth.guardian.hint")}</p>
                <Input
                  type="text"
                  placeholder={t("auth.guardian.name")}
                  value={guardianName}
                  required
                  onChange={(e) => setGuardianName(e.target.value)}
                />
                <Input
                  type="text"
                  placeholder={t("auth.guardian.identifierValue")}
                  value={guardianIdentifierValue}
                  required
                  onChange={(e) => setGuardianIdentifierValue(e.target.value)}
                />
                <Select
                  value={guardianRelationship}
                  onChange={(e) =>
                    setGuardianRelationship(
                      e.target.value as auth.GuardianAuthorization["relationship"],
                    )
                  }
                  options={GUARDIAN_RELATIONSHIP_OPTIONS.map((o) => ({
                    value: o.value,
                    label: t(`auth.guardian.relationship.${o.value}`),
                  }))}
                />
                <label className="flex items-start gap-2 text-xs text-muted-foreground">
                  <input
                    type="checkbox"
                    required
                    checked={guardianAccepted}
                    onChange={(e) => setGuardianAccepted(e.target.checked)}
                    className="mt-0.5"
                    aria-label={t("auth.guardian.accept")}
                  />
                  <span>{t("auth.guardian.accept")}</span>
                </label>
              </div>
            ) : null}
            {error ? (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            ) : null}
            <Button type="submit" disabled={busy} className="w-full">
              {t("auth.createAccount")}
            </Button>
          </form>
          <p className="mt-4 text-center text-sm text-muted-foreground">
            {t("auth.haveAccount")}{" "}
            <Link to="/login" className="font-medium text-primary hover:underline">
              {t("auth.signIn")}
            </Link>
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
