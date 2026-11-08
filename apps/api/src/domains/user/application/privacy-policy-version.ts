/** Server-defined identifier for "which version of the privacy policy and sensitive-data consent
 * text was shown" (Ley 21.719 Art. 16) — the date of the published policy
 * (`mifik.cl/es/privacy-policy/`, source `packages/i18n/legal/privacy-policy.es.md`), bumped by
 * hand whenever that policy or the consent text materially changes. Never client-supplied (a
 * client claiming an earlier/different version would be worthless as evidence). Each
 * `ConsentRecord` keeps the version current at the moment it was given.
 * History: "2026-09-20" (consent text only, no published policy yet) → "2026-10-11" (policy
 * published on the public site and linked from the sign-up consent) → "2026-10-14" (deleting the
 * account always deletes everything; the "keep an anonymized history" option is gone) →
 * "2026-10-15" ("Descargar mis datos": a copy of ALL the data, Excel or JSON, from the app) →
 * "2026-11-02" (Sentry receives the app's browser error reports) → "2026-11-05" (two-step
 * verification by email codes and "remember this device", specs/040; and a passkey's model checked
 * against the FIDO Alliance catalog, specs/041 — both before either was published). */
export const CURRENT_PRIVACY_POLICY_VERSION = "2026-11-05";
