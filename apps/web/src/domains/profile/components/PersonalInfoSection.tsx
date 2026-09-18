import { Check, Pencil } from "lucide-react";
import { type KeyboardEvent, type ReactNode, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { auth as authContract } from "@finance/contracts";
import type { auth } from "@finance/contracts";

import { useAuth } from "../../auth/hooks/useAuth";
import { useCountries } from "../../reference/hooks/useReference";
import { ApiRequestError } from "../../../shared/lib/apiClient";
import { cn } from "../../../shared/lib/cn";
import { Button } from "../../../shared/ui/button";
import { CollapsibleSection } from "../../../shared/ui/collapsible-section";
import { SearchableSelect } from "../../../shared/ui/searchable-select";
import {
  combinePhone,
  stripCallingCode,
  useCountryCallingCode,
} from "../hooks/useCountryCallingCode";
import { useAvailableIdentifierTypes } from "../hooks/useIdentifierTypes";
import { useProfileMutations } from "../hooks/useProfile";

/** One datum = one row. Clicking a row opens it; each row saves on its own. */
export type PersonalFieldKey =
  "name" | "email" | "phone" | "identifier" | "birthDate" | "address" | "country";

/** Every editable part, named by the contract field it writes to. */
type PartKey =
  | "name"
  | "email"
  | "phone"
  | "identifierType"
  | "identifierValue"
  | "birthDate"
  | "addressStreet"
  | "addressCity"
  | "addressRegion"
  | "addressPostalCode"
  | "countryId";

type Draft = Record<PartKey, string>;

/** How long the "Guardado" confirmation stays on the row it belongs to. */
const SAVED_BADGE_MS = 2200;

/** Underlined, unfilled field: the block is already a shaded surface, so the
 * field only needs to say where the text goes. */
const LINE_INPUT =
  "h-9 w-full min-w-0 rounded-none border-0 border-b border-ring bg-transparent px-0.5 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none";

/**
 * Same underline treatment for a `SearchableSelect`. It can't reuse
 * `LINE_INPUT` as-is: that class carries `border-b`, and `SearchableSelect`
 * applies its `className` to BOTH its outer wrapper div and its inner button
 * (documented on the component — the wrapper only exists for width overrides),
 * so a border class in there paints twice, stacked, and reads as a double
 * line. The border lives on a dedicated wrapper around the select instead;
 * this class only carries the borderless, left-aligned line styling.
 */
const LINE_SELECT =
  "h-9 min-h-0 w-full min-w-0 justify-start px-0.5 text-left text-sm font-normal text-foreground focus-visible:outline-none";

/**
 * A borderless twin of `LINE_INPUT`, for a text field sharing ONE underline
 * with a sibling control (e.g. an identifier's type picker) instead of
 * drawing its own — the border moves to whatever wraps the pair.
 */
const BARE_LINE_INPUT =
  "h-9 w-full min-w-0 rounded-none border-0 bg-transparent px-0.5 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none";

function emptyDraft(): Draft {
  return {
    name: "",
    email: "",
    phone: "",
    identifierType: "RUT",
    identifierValue: "",
    birthDate: "",
    addressStreet: "",
    addressCity: "",
    addressRegion: "",
    addressPostalCode: "",
    countryId: "",
  };
}

function draftFrom(
  user: auth.CurrentUser,
  callingCode: string | null,
  fallbackType: string,
): Draft {
  return {
    name: user.name ?? "",
    email: user.email ?? "",
    phone: stripCallingCode(user.phone ?? "", callingCode),
    identifierType: user.identifierType ?? fallbackType,
    identifierValue: user.identifierValue ?? "",
    birthDate: user.birthDate ?? "",
    addressStreet: user.addressStreet ?? "",
    addressCity: user.addressCity ?? "",
    addressRegion: user.addressRegion ?? "",
    addressPostalCode: user.addressPostalCode ?? "",
    countryId: user.countryId ?? "",
  };
}

/** A labelled line inside an open row — one per part of the datum. */
function FieldLine({ label, children }: Readonly<{ label: string; children: ReactNode }>) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

export function PersonalInfoSection({
  editRequest,
}: Readonly<{ editRequest?: { field: PersonalFieldKey } | null }> = {}) {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const { data: countries } = useCountries();
  const { updateProfile } = useProfileMutations();

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<PersonalFieldKey | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<PersonalFieldKey | null>(null);
  const [handledRequest, setHandledRequest] = useState<object | null>(null);
  const savedTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const sectionRef = useRef<HTMLDivElement>(null);

  const availableIdentifierTypes = useAvailableIdentifierTypes(user?.countryId ?? null);
  const callingCode = useCountryCallingCode(user?.countryId ?? null);

  function startEditing(field: PersonalFieldKey) {
    if (!user) return;
    setError(null);
    setSaved(null);
    setDraft(draftFrom(user, callingCode, availableIdentifierTypes[0] ?? "RUT"));
    setEditing(field);
  }

  // Adjusting state while rendering, not in an effect: the supported "a prop
  // changed, derive from it" path. The request is an object, so asking for the
  // same field twice is two distinct requests.
  if (editRequest && editRequest !== handledRequest && user) {
    setHandledRequest(editRequest);
    setOpen(true);
    startEditing(editRequest.field);
  }

  useEffect(() => {
    if (!handledRequest) return;
    sectionRef.current?.scrollIntoView?.({ block: "center", behavior: "smooth" });
  }, [handledRequest]);

  // The badge outlives the save, so its timer can outlive the component.
  useEffect(() => () => clearTimeout(savedTimer.current), []);

  if (!user) return null;

  function set(part: PartKey, value: string) {
    setDraft((current) => ({ ...current, [part]: value }));
  }

  function payloadFor(field: PersonalFieldKey): auth.UpdateProfileRequest {
    switch (field) {
      case "name":
        return { name: draft.name };
      case "email":
        return { email: draft.email };
      case "phone":
        return { phone: combinePhone(draft.phone, callingCode) || null };
      case "identifier":
        return {
          identifierValue: draft.identifierValue || null,
          identifierType: draft.identifierValue
            ? (draft.identifierType as auth.CurrentUser["identifierType"])
            : null,
        };
      case "birthDate":
        return { birthDate: draft.birthDate ? new Date(draft.birthDate) : null };
      case "address":
        return {
          addressStreet: draft.addressStreet || null,
          addressCity: draft.addressCity || null,
          addressRegion: draft.addressRegion || null,
          addressPostalCode: draft.addressPostalCode || null,
        };
      case "country":
        return { countryId: draft.countryId || null };
    }
  }

  /** Mirrors the contract's own refine (the same function), so the row never
   * sends something the API is going to reject anyway. */
  function localError(field: PersonalFieldKey): string | null {
    if (
      field === "identifier" &&
      draft.identifierValue &&
      draft.identifierType === "RUT" &&
      !authContract.isValidRut(draft.identifierValue)
    ) {
      return t("profile.edit.invalidRut");
    }
    return null;
  }

  async function save(field: PersonalFieldKey) {
    const invalid = localError(field);
    if (invalid) {
      setError(invalid);
      return;
    }
    setError(null);
    try {
      await updateProfile.mutateAsync(payloadFor(field));
      setEditing(null);
      setSaved(field);
      clearTimeout(savedTimer.current);
      savedTimer.current = setTimeout(() => setSaved(null), SAVED_BADGE_MS);
    } catch (err) {
      const code = err instanceof ApiRequestError ? err.code : "INTERNAL_ERROR";
      setError(t(`errors.${code}`));
    }
  }

  function keys(field: PersonalFieldKey) {
    return (e: KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        void save(field);
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setEditing(null);
      }
    };
  }

  /**
   * `ariaLabel` is always set explicitly rather than relied on from the
   * wrapping `FieldLine`'s `<label>`: a combined row (the identifier's type +
   * number) wraps TWO controls in one `<label>`, where implicit association is
   * ambiguous — an explicit `aria-label` wins over that regardless, so every
   * field keeps a distinct accessible name whether it shares a row or not.
   * `bare` drops the field's own underline — for one sharing a row (and its
   * border) with a sibling control.
   */
  function lineInput(
    part: PartKey,
    field: PersonalFieldKey,
    ariaLabel: string,
    options?: { type?: string; placeholder?: string; bare?: boolean },
  ) {
    return (
      <input
        type={options?.type ?? "text"}
        value={draft[part]}
        autoFocus={
          part === "name" ||
          part === "email" ||
          part === "phone" ||
          part === "addressStreet" ||
          part === "identifierValue" ||
          part === "birthDate"
        }
        placeholder={options?.placeholder}
        aria-label={ariaLabel}
        className={options?.bare ? BARE_LINE_INPUT : LINE_INPUT}
        onChange={(e) => set(part, e.target.value)}
        onKeyDown={keys(field)}
      />
    );
  }

  const notSet = t("profile.personalInfo.notSet");
  const address = [user.addressStreet, user.addressCity, user.addressRegion, user.addressPostalCode]
    .filter(Boolean)
    .join(", ");
  const birthDateLabel = user.birthDate
    ? new Date(user.birthDate).toLocaleDateString(i18n.language)
    : null;
  const identifierLabel = user.identifierValue
    ? `${t(`profile.edit.identifierTypes.${user.identifierType}`)}: ${user.identifierValue}`
    : null;

  const catalogue = (countries ?? []).map((c) => ({ value: c.id, label: c.name }));
  // The saved country is always an option, even before the catalogue lands —
  // otherwise the row would read "Sin especificar" for a user who has one.
  const savedMissing = user.countryId && !catalogue.some((o) => o.value === user.countryId);
  const countryOptions = [
    { value: "", label: t("profile.edit.countryNone") },
    ...(savedMissing
      ? [{ value: user.countryId!, label: user.countryName ?? user.countryId! }]
      : []),
    ...catalogue,
  ];

  const rows: {
    key: PersonalFieldKey;
    label: string;
    value: string | null;
    hint: string;
    lines: ReactNode;
  }[] = [
    {
      key: "name",
      label: t("profile.edit.name"),
      value: user.name,
      hint: t("profile.edit.hintName"),
      lines: (
        <FieldLine label={t("profile.edit.name")}>
          {lineInput("name", "name", t("profile.edit.name"))}
        </FieldLine>
      ),
    },
    {
      key: "email",
      label: t("profile.edit.email"),
      value: user.email,
      hint: t("profile.edit.hintEmail"),
      lines: (
        <FieldLine label={t("profile.edit.email")}>
          {lineInput("email", "email", t("profile.edit.email"), { type: "email" })}
        </FieldLine>
      ),
    },
    {
      key: "phone",
      label: t("profile.edit.phone"),
      value: user.phone ?? null,
      hint: callingCode ? t("profile.edit.hintPhone") : t("profile.edit.phoneNoCountryHint"),
      lines: (
        <FieldLine label={t("profile.edit.phone")}>
          <span className="flex items-center gap-2">
            {callingCode ? (
              <span className="shrink-0 text-sm text-muted-foreground">{callingCode}</span>
            ) : null}
            {lineInput("phone", "phone", t("profile.edit.phone"), {
              type: "tel",
              placeholder: "9 ····",
            })}
          </span>
        </FieldLine>
      ),
    },
    {
      key: "identifier",
      label: t("profile.edit.identifier"),
      value: identifierLabel,
      hint: t("profile.edit.hintIdentifier"),
      lines: (
        <FieldLine label={t("profile.edit.identifier")}>
          <span className="flex items-center gap-2 border-b border-ring">
            <SearchableSelect
              variant="inline"
              // This picker sits at the START of its row (like a phone's
              // calling code), not the end — the default "end" alignment
              // would grow the panel LEFTWARD from here, past the row and
              // into whatever sits beside this section.
              align="start"
              className={cn(LINE_SELECT, "w-auto min-w-0 shrink-0")}
              value={draft.identifierType}
              options={availableIdentifierTypes.map((v) => ({
                value: v,
                label: t(`profile.edit.identifierTypes.${v}`),
              }))}
              searchPlaceholder={t("common.search")}
              noResultsLabel={t("common.noResults")}
              aria-label={t("profile.edit.identifierType")}
              onChange={(v) => set("identifierType", v)}
            />
            {lineInput("identifierValue", "identifier", t("profile.edit.identifierValue"), {
              placeholder: "12.345.678-9",
              bare: true,
            })}
          </span>
        </FieldLine>
      ),
    },
    {
      key: "birthDate",
      label: t("profile.edit.birthDate"),
      value: birthDateLabel,
      hint: t("profile.edit.hintBirthDate"),
      lines: (
        <FieldLine label={t("profile.edit.birthDate")}>
          {lineInput("birthDate", "birthDate", t("profile.edit.birthDate"), { type: "date" })}
        </FieldLine>
      ),
    },
    {
      key: "address",
      label: t("profile.edit.address"),
      value: address || null,
      hint: t("profile.edit.hintAddress"),
      lines: (
        <>
          <FieldLine label={t("profile.edit.addressStreetShort")}>
            {lineInput("addressStreet", "address", t("profile.edit.addressStreetShort"))}
          </FieldLine>
          <FieldLine label={t("profile.edit.addressCity")}>
            {lineInput("addressCity", "address", t("profile.edit.addressCity"))}
          </FieldLine>
          <FieldLine label={t("profile.edit.addressRegion")}>
            {lineInput("addressRegion", "address", t("profile.edit.addressRegion"))}
          </FieldLine>
          <FieldLine label={t("profile.edit.addressPostalCode")}>
            {lineInput("addressPostalCode", "address", t("profile.edit.addressPostalCode"))}
          </FieldLine>
        </>
      ),
    },
    {
      key: "country",
      label: t("profile.edit.country"),
      value: user.countryName ?? null,
      hint: t("profile.edit.countryHint"),
      lines: (
        <FieldLine label={t("profile.edit.country")}>
          <div className="border-b border-ring">
            <SearchableSelect
              variant="inline"
              className={LINE_SELECT}
              value={draft.countryId}
              options={countryOptions}
              searchPlaceholder={t("common.search")}
              noResultsLabel={t("common.noResults")}
              aria-label={t("profile.edit.country")}
              onChange={(v) => set("countryId", v)}
            />
          </div>
        </FieldLine>
      ),
    },
  ];

  return (
    <CollapsibleSection title={t("profile.personalInfo.title")} open={open} onOpenChange={setOpen}>
      <div ref={sectionRef}>
        {rows.map((row) => (
          <div key={row.key} className="-mx-5 border-t border-border">
            {editing === row.key ? (
              <div className="flex flex-col gap-2.5 bg-muted/30 px-5 py-3.5">
                {row.lines}
                <div className="flex flex-wrap items-center justify-end gap-2 pt-0.5">
                  <Button variant="outline" size="sm" onClick={() => setEditing(null)}>
                    {t("common.cancel")}
                  </Button>
                  <Button
                    size="sm"
                    disabled={updateProfile.isPending}
                    onClick={() => save(row.key)}
                  >
                    {t("common.save")}
                  </Button>
                </div>
                {error ? (
                  <p role="alert" className="text-xs text-destructive">
                    {error}
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground/80">{row.hint}</p>
                )}
              </div>
            ) : (
              <button
                type="button"
                onClick={() => startEditing(row.key)}
                className="flex w-full items-center justify-between gap-4 px-5 py-3.5 text-left transition-colors hover:bg-muted/30"
              >
                <span className="whitespace-nowrap text-sm text-muted-foreground">{row.label}</span>
                <span className="flex min-w-0 items-center gap-2.5">
                  {saved === row.key ? (
                    <span className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-success">
                      <Check className="size-3" aria-hidden />
                      {t("profile.edit.saved")}
                    </span>
                  ) : null}
                  <span
                    className={cn(
                      "truncate text-sm font-medium",
                      !row.value && "font-normal italic text-muted-foreground",
                    )}
                  >
                    {row.value || notSet}
                  </span>
                  <Pencil className="size-3.5 shrink-0 text-muted-foreground/70" aria-hidden />
                </span>
              </button>
            )}
          </div>
        ))}
      </div>
    </CollapsibleSection>
  );
}
