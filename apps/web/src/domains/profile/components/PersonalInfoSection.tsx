import { Pencil } from "lucide-react";
import { type ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";

import type { auth } from "@finance/contracts";

import { useAuth } from "../../auth/hooks/useAuth";
import { useCountries } from "../../reference/hooks/useReference";
import { ApiRequestError } from "../../../shared/lib/apiClient";
import { Button } from "../../../shared/ui/button";
import { CollapsibleSection } from "../../../shared/ui/collapsible-section";
import { Input } from "../../../shared/ui/input";
import { Select } from "../../../shared/ui/select";
import {
  combinePhone,
  stripCallingCode,
  useCountryCallingCode,
} from "../hooks/useCountryCallingCode";
import { useAvailableIdentifierTypes } from "../hooks/useIdentifierTypes";
import { useProfileMutations } from "../hooks/useProfile";

type FieldKey = "name" | "email" | "phone" | "identifier" | "birthDate" | "address" | "country";

function Row({
  label,
  value,
  editing,
  onEdit,
  onCancel,
  children,
}: Readonly<{
  label: string;
  value: string;
  editing: boolean;
  onEdit: () => void;
  onCancel: () => void;
  children: ReactNode;
}>) {
  const { t } = useTranslation();
  return (
    <div className="border-b py-3 last:border-b-0">
      <div className="flex items-center justify-between gap-4">
        <span className="text-sm text-muted-foreground">{label}</span>
        {editing ? (
          <button
            type="button"
            onClick={onCancel}
            className="text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            {t("profile.edit.cancel")}
          </button>
        ) : (
          <button
            type="button"
            onClick={onEdit}
            className="flex min-w-0 items-center gap-1.5 text-sm font-medium hover:text-primary"
          >
            <span className="truncate">{value}</span>
            <Pencil className="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden />
          </button>
        )}
      </div>
      {editing ? <div className="mt-2">{children}</div> : null}
    </div>
  );
}

export function PersonalInfoSection() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const { data: countries } = useCountries();
  const { updateProfile } = useProfileMutations();
  const [editing, setEditing] = useState<FieldKey | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [identifierType, setIdentifierType] = useState<auth.CurrentUser["identifierType"]>("RUT");
  const [identifierValue, setIdentifierValue] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [addressStreet, setAddressStreet] = useState("");
  const [addressCity, setAddressCity] = useState("");
  const [addressRegion, setAddressRegion] = useState("");
  const [addressPostalCode, setAddressPostalCode] = useState("");
  const [countryId, setCountryId] = useState("");

  const availableIdentifierTypes = useAvailableIdentifierTypes(user?.countryId ?? null);
  const callingCode = useCountryCallingCode(user?.countryId ?? null);

  if (!user) return null;

  function startEdit(field: FieldKey) {
    setError(null);
    if (field === "name") setName(user!.name ?? "");
    if (field === "email") setEmail(user!.email ?? "");
    if (field === "phone") setPhone(stripCallingCode(user!.phone ?? "", callingCode));
    if (field === "identifier") {
      setIdentifierType(user!.identifierType ?? availableIdentifierTypes[0] ?? "RUT");
      setIdentifierValue(user!.identifierValue ?? "");
    }
    if (field === "birthDate") setBirthDate(user!.birthDate ?? "");
    if (field === "address") {
      setAddressStreet(user!.addressStreet ?? "");
      setAddressCity(user!.addressCity ?? "");
      setAddressRegion(user!.addressRegion ?? "");
      setAddressPostalCode(user!.addressPostalCode ?? "");
    }
    if (field === "country") setCountryId(user!.countryId ?? "");
    setEditing(field);
  }

  async function save(payload: auth.UpdateProfileRequest) {
    setError(null);
    try {
      await updateProfile.mutateAsync(payload);
      setEditing(null);
    } catch (err) {
      const code = err instanceof ApiRequestError ? err.code : "INTERNAL_ERROR";
      setError(t(`errors.${code}`));
    }
  }

  const notSet = t("profile.personalInfo.notSet");
  const address = [user.addressStreet, user.addressCity, user.addressRegion, user.addressPostalCode]
    .filter(Boolean)
    .join(", ");
  const birthDateLabel = user.birthDate
    ? `${new Date(user.birthDate).toLocaleDateString(i18n.language)} (${t("profile.ageYears", { age: user.age })})`
    : notSet;
  const identifierLabel = user.identifierValue
    ? `${t(`profile.edit.identifierTypes.${user.identifierType}`)}: ${user.identifierValue}`
    : notSet;

  const countryOptions = [
    { value: "", label: t("profile.edit.countryNone") },
    ...(countries ?? []).map((c) => ({ value: c.id, label: c.name })),
  ];

  return (
    <CollapsibleSection title={t("profile.personalInfo.title")}>
      <Row
        label={t("profile.edit.name")}
        value={user.name ?? notSet}
        editing={editing === "name"}
        onEdit={() => startEdit("name")}
        onCancel={() => setEditing(null)}
      >
        <div className="flex gap-2">
          <Input value={name} autoFocus onChange={(e) => setName(e.target.value)} />
          <Button size="sm" onClick={() => save({ name })} disabled={updateProfile.isPending}>
            {t("profile.edit.save")}
          </Button>
        </div>
      </Row>

      <Row
        label={t("profile.edit.email")}
        value={user.email ?? notSet}
        editing={editing === "email"}
        onEdit={() => startEdit("email")}
        onCancel={() => setEditing(null)}
      >
        <div className="flex flex-col gap-2">
          <div className="flex gap-2">
            <Input
              type="email"
              value={email}
              autoFocus
              onChange={(e) => setEmail(e.target.value)}
            />
            <Button size="sm" onClick={() => save({ email })} disabled={updateProfile.isPending}>
              {t("profile.edit.save")}
            </Button>
          </div>
          {error ? (
            <p role="alert" className="text-xs text-destructive">
              {error}
            </p>
          ) : null}
        </div>
      </Row>

      <Row
        label={t("profile.edit.phone")}
        value={user.phone ?? notSet}
        editing={editing === "phone"}
        onEdit={() => startEdit("phone")}
        onCancel={() => setEditing(null)}
      >
        <div className="flex flex-col gap-2">
          <div className="flex gap-2">
            {callingCode ? (
              <span className="flex h-10 shrink-0 items-center rounded-md border border-input bg-muted px-3 text-sm text-muted-foreground">
                {callingCode}
              </span>
            ) : null}
            <Input
              type="tel"
              value={phone}
              autoFocus
              placeholder="9 ····"
              onChange={(e) => setPhone(e.target.value)}
            />
            <Button
              size="sm"
              className="shrink-0"
              onClick={() => save({ phone: combinePhone(phone, callingCode) || null })}
              disabled={updateProfile.isPending}
            >
              {t("profile.edit.save")}
            </Button>
          </div>
          {!callingCode ? (
            <p className="text-xs text-muted-foreground">{t("profile.edit.phoneNoCountryHint")}</p>
          ) : null}
        </div>
      </Row>

      <Row
        label={t("profile.edit.identifierValue")}
        value={identifierLabel}
        editing={editing === "identifier"}
        onEdit={() => startEdit("identifier")}
        onCancel={() => setEditing(null)}
      >
        <div className="flex flex-col gap-2">
          <div className="flex gap-2">
            <Select
              className="w-32"
              value={identifierType ?? availableIdentifierTypes[0] ?? "RUT"}
              options={availableIdentifierTypes.map((v) => ({
                value: v,
                label: t(`profile.edit.identifierTypes.${v}`),
              }))}
              onChange={(e) =>
                setIdentifierType(e.target.value as auth.CurrentUser["identifierType"])
              }
            />
            <Input
              value={identifierValue}
              autoFocus
              placeholder="12.345.678-9"
              onChange={(e) => setIdentifierValue(e.target.value)}
            />
            <Button
              size="sm"
              onClick={() =>
                save({
                  identifierType: identifierValue ? identifierType : null,
                  identifierValue: identifierValue || null,
                })
              }
              disabled={updateProfile.isPending}
            >
              {t("profile.edit.save")}
            </Button>
          </div>
          {error ? (
            <p role="alert" className="text-xs text-destructive">
              {error}
            </p>
          ) : null}
        </div>
      </Row>

      <Row
        label={t("profile.edit.birthDate")}
        value={birthDateLabel}
        editing={editing === "birthDate"}
        onEdit={() => startEdit("birthDate")}
        onCancel={() => setEditing(null)}
      >
        <div className="flex gap-2">
          <Input
            type="date"
            value={birthDate}
            autoFocus
            onChange={(e) => setBirthDate(e.target.value)}
          />
          <Button
            size="sm"
            onClick={() => save({ birthDate: birthDate ? new Date(birthDate) : null })}
            disabled={updateProfile.isPending}
          >
            {t("profile.edit.save")}
          </Button>
        </div>
      </Row>

      <Row
        label={t("profile.edit.addressStreet")}
        value={address || notSet}
        editing={editing === "address"}
        onEdit={() => startEdit("address")}
        onCancel={() => setEditing(null)}
      >
        <div className="flex flex-col gap-2">
          <Input
            value={addressStreet}
            autoFocus
            placeholder={t("profile.edit.addressStreet")}
            onChange={(e) => setAddressStreet(e.target.value)}
          />
          <div className="grid grid-cols-2 gap-2">
            <Input
              value={addressCity}
              placeholder={t("profile.edit.addressCity")}
              onChange={(e) => setAddressCity(e.target.value)}
            />
            <Input
              value={addressRegion}
              placeholder={t("profile.edit.addressRegion")}
              onChange={(e) => setAddressRegion(e.target.value)}
            />
          </div>
          <div className="flex gap-2">
            <Input
              value={addressPostalCode}
              placeholder={t("profile.edit.addressPostalCode")}
              onChange={(e) => setAddressPostalCode(e.target.value)}
            />
            <Button
              size="sm"
              className="shrink-0"
              onClick={() =>
                save({
                  addressStreet: addressStreet || null,
                  addressCity: addressCity || null,
                  addressRegion: addressRegion || null,
                  addressPostalCode: addressPostalCode || null,
                })
              }
              disabled={updateProfile.isPending}
            >
              {t("profile.edit.save")}
            </Button>
          </div>
        </div>
      </Row>

      <Row
        label={t("profile.edit.country")}
        value={user.countryName ?? notSet}
        editing={editing === "country"}
        onEdit={() => startEdit("country")}
        onCancel={() => setEditing(null)}
      >
        <div className="flex gap-2">
          <Select
            value={countryId}
            options={countryOptions}
            onChange={(e) => setCountryId(e.target.value)}
          />
          <Button
            size="sm"
            className="shrink-0"
            onClick={() => save({ countryId: countryId || null })}
            disabled={updateProfile.isPending}
          >
            {t("profile.edit.save")}
          </Button>
        </div>
      </Row>
    </CollapsibleSection>
  );
}
