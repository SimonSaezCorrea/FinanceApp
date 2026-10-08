import { ShieldCheck } from "lucide-react";
import { useTranslation } from "react-i18next";

import { useConsentsQuery } from "../hooks/useProfile";

const CONSENT_TYPE_KEYS: Record<string, string> = {
  SENSITIVE_DATA_PROCESSING: "profile.consents.type.sensitiveDataProcessing",
  MINOR_GUARDIAN_AUTHORIZATION: "profile.consents.type.minorGuardianAuthorization",
};

const GUARDIAN_RELATIONSHIP_KEYS: Record<string, string> = {
  MOTHER: "auth.guardian.relationship.MOTHER",
  FATHER: "auth.guardian.relationship.FATHER",
  GUARDIAN: "auth.guardian.relationship.GUARDIAN",
  OTHER: "auth.guardian.relationship.OTHER",
};

function cnRow(index: number, total: number): string {
  const base = "flex items-center gap-3 px-3.5 py-2.5";
  return index < total - 1 ? `${base} border-b` : base;
}

/** "Mis consentimientos" — every consent the user granted (Ley 21.719 Art. 16), read-only.
 * Today only ever has one row (the reinforced consent recorded at registration); the table
 * shape is what matters here, since a future consent type just appends another row with no
 * UI change needed. */
export function ConsentHistorySection() {
  const { t, i18n } = useTranslation();
  const { data: consents, isLoading } = useConsentsQuery();
  const list = consents ?? [];

  return (
    <section
      aria-labelledby="profile-consents-title"
      className="flex flex-col gap-3 rounded-2xl border bg-card p-5"
    >
      <div className="flex flex-col gap-1">
        <h2 id="profile-consents-title" className="text-base font-semibold">
          {t("profile.consents.title")}
        </h2>
        <p className="text-xs text-muted-foreground">{t("profile.consents.description")}</p>
      </div>
      <div className="overflow-hidden rounded-lg border">
        {isLoading ? (
          <p className="px-3.5 py-2.5 text-xs text-muted-foreground">
            {t("profile.consents.loading")}
          </p>
        ) : (
          list.map((c, i) => (
            <div key={c.id} className={cnRow(i, list.length)}>
              <ShieldCheck className="h-4 w-4 shrink-0 text-success" aria-hidden />
              <div className="min-w-0 flex-1">
                <div className="text-xs font-medium">{t(CONSENT_TYPE_KEYS[c.type] ?? c.type)}</div>
                {c.guardianName ? (
                  <div className="text-[11px] text-muted-foreground">
                    {c.guardianName}
                    {c.guardianRelationship
                      ? ` · ${t(GUARDIAN_RELATIONSHIP_KEYS[c.guardianRelationship] ?? c.guardianRelationship)}`
                      : ""}
                  </div>
                ) : null}
                <div className="text-[11px] text-muted-foreground">
                  {t("profile.consents.grantedAt", {
                    date: new Date(c.grantedAt).toLocaleDateString(i18n.language),
                    version: c.policyVersion,
                  })}
                  {c.revokedAt
                    ? ` · ${t("profile.consents.revokedAt", {
                        date: new Date(c.revokedAt).toLocaleDateString(i18n.language),
                      })}`
                    : ""}
                </div>
              </div>
            </div>
          ))
        )}
        {!isLoading && list.length === 0 ? (
          <p className="px-3.5 py-2.5 text-xs text-muted-foreground">
            {t("profile.consents.empty")}
          </p>
        ) : null}
      </div>
    </section>
  );
}
