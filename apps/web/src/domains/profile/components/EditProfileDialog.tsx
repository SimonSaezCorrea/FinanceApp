import { type FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";

import type { auth } from "@finance/contracts";

import { useAuth } from "../../auth/hooks/useAuth";
import { useCountries } from "../../reference/hooks/useReference";
import { ApiRequestError } from "../../../shared/lib/apiClient";
import { Button } from "../../../shared/ui/button";
import { ResponsiveSurface } from "../../../shared/ui/overlay";
import { Field } from "../../../shared/ui/field";
import { Input } from "../../../shared/ui/input";
import { Select } from "../../../shared/ui/select";
import {
  combinePhone,
  stripCallingCode,
  useCountryCallingCode,
} from "../hooks/useCountryCallingCode";
import { ALL_IDENTIFIER_TYPES, useAvailableIdentifierTypes } from "../hooks/useIdentifierTypes";
import { useProfileMutations } from "../hooks/useProfile";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EditProfileDialog({ open, onOpenChange }: Readonly<Props>) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { data: countries } = useCountries();
  const { updateProfile } = useProfileMutations();

  const [name, setName] = useState(user?.name ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [countryId, setCountryId] = useState(user?.countryId ?? "");
  const [addressStreet, setAddressStreet] = useState(user?.addressStreet ?? "");
  const [addressCity, setAddressCity] = useState(user?.addressCity ?? "");
  const [addressRegion, setAddressRegion] = useState(user?.addressRegion ?? "");
  const [addressPostalCode, setAddressPostalCode] = useState(user?.addressPostalCode ?? "");
  const callingCode = useCountryCallingCode(countryId || null);
  const [phone, setPhone] = useState(() => stripCallingCode(user?.phone ?? "", callingCode));
  const [birthDate, setBirthDate] = useState(user?.birthDate ?? "");
  const [identifierType, setIdentifierType] = useState<auth.CurrentUser["identifierType"]>(
    user?.identifierType ?? "RUT",
  );
  const [identifierValue, setIdentifierValue] = useState(user?.identifierValue ?? "");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await updateProfile.mutateAsync({
        name,
        email,
        countryId: countryId || null,
        addressStreet: addressStreet || null,
        addressCity: addressCity || null,
        addressRegion: addressRegion || null,
        addressPostalCode: addressPostalCode || null,
        phone: combinePhone(phone, callingCode) || null,
        birthDate: birthDate ? new Date(birthDate) : null,
        identifierType: identifierValue ? identifierType : null,
        identifierValue: identifierValue || null,
      });
      onOpenChange(false);
    } catch (err) {
      const code = err instanceof ApiRequestError ? err.code : "INTERNAL_ERROR";
      setError(t(`errors.${code}`));
    }
  }

  const countryOptions = [
    { value: "", label: t("profile.edit.countryNone") },
    ...(countries ?? []).map((c) => ({ value: c.id, label: c.name })),
  ];

  const availableIdentifierTypes = useAvailableIdentifierTypes(countryId || null);

  function handleCountryChange(nextCountryId: string) {
    setCountryId(nextCountryId);
    const nextCountry = countries?.find((c) => c.id === nextCountryId);
    const nextTypes =
      nextCountry && nextCountry.identifierTypes.length > 0
        ? nextCountry.identifierTypes
        : ALL_IDENTIFIER_TYPES;
    if (!identifierType || !nextTypes.includes(identifierType)) {
      setIdentifierType(nextTypes[0]!);
    }
  }

  return (
    <ResponsiveSurface open={open} onOpenChange={onOpenChange} title={t("profile.edit.title")}>
      <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
        <Field label={t("profile.edit.name")}>
          <Input
            id="profile-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            aria-label={t("profile.edit.name")}
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t("profile.edit.email")} error={error}>
            <Input
              id="profile-email"
              type="email"
              value={email}
              required
              onChange={(e) => setEmail(e.target.value)}
              aria-label={t("profile.edit.email")}
            />
          </Field>
          <Field label={t("profile.edit.phone")}>
            <div className="flex gap-2">
              {callingCode ? (
                <span className="flex h-10 shrink-0 items-center rounded-md border border-input bg-muted px-3 text-sm text-muted-foreground">
                  {callingCode}
                </span>
              ) : null}
              <Input
                id="profile-phone"
                type="tel"
                value={phone}
                placeholder="9 ····"
                onChange={(e) => setPhone(e.target.value)}
                aria-label={t("profile.edit.phone")}
              />
            </div>
          </Field>
        </div>

        <div className="border-t pt-4 text-sm font-semibold">{t("profile.edit.personalInfo")}</div>

        <Field label={t("profile.edit.country")}>
          <Select
            id="profile-country"
            value={countryId}
            options={countryOptions}
            onChange={(e) => handleCountryChange(e.target.value)}
            aria-label={t("profile.edit.country")}
          />
        </Field>
        <Field label={t("profile.edit.birthDate")}>
          <Input
            id="profile-birthdate"
            type="date"
            value={birthDate}
            onChange={(e) => setBirthDate(e.target.value)}
            aria-label={t("profile.edit.birthDate")}
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t("profile.edit.identifierType")}>
            <Select
              id="profile-identifier-type"
              value={identifierType ?? availableIdentifierTypes[0]!}
              options={availableIdentifierTypes.map((v) => ({
                value: v as string,
                label: t(`profile.edit.identifierTypes.${v}`),
              }))}
              onChange={(e) =>
                setIdentifierType(e.target.value as auth.CurrentUser["identifierType"])
              }
              aria-label={t("profile.edit.identifierType")}
            />
          </Field>
          <Field label={t("profile.edit.identifierValue")}>
            <Input
              id="profile-identifier-value"
              value={identifierValue}
              placeholder="12.345.678-9"
              onChange={(e) => setIdentifierValue(e.target.value)}
              aria-label={t("profile.edit.identifierValue")}
            />
          </Field>
        </div>

        <Field label={t("profile.edit.addressStreet")}>
          <Input
            id="profile-address-street"
            value={addressStreet}
            onChange={(e) => setAddressStreet(e.target.value)}
            aria-label={t("profile.edit.addressStreet")}
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t("profile.edit.addressCity")}>
            <Input
              id="profile-address-city"
              value={addressCity}
              onChange={(e) => setAddressCity(e.target.value)}
              aria-label={t("profile.edit.addressCity")}
            />
          </Field>
          <Field label={t("profile.edit.addressRegion")}>
            <Input
              id="profile-address-region"
              value={addressRegion}
              onChange={(e) => setAddressRegion(e.target.value)}
              aria-label={t("profile.edit.addressRegion")}
            />
          </Field>
        </div>
        <Field label={t("profile.edit.addressPostalCode")}>
          <Input
            id="profile-address-postal"
            value={addressPostalCode}
            onChange={(e) => setAddressPostalCode(e.target.value)}
            aria-label={t("profile.edit.addressPostalCode")}
          />
        </Field>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t("profile.edit.cancel")}
          </Button>
          <Button type="submit" disabled={updateProfile.isPending}>
            {t("profile.edit.save")}
          </Button>
        </div>
      </form>
    </ResponsiveSurface>
  );
}
