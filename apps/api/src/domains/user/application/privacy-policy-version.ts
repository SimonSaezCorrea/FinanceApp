/** Server-defined identifier for "which version of the privacy policy and sensitive-data consent
 * text was shown" (Ley 21.719 Art. 16) — the date of the published policy
 * (`mifik.cl/es/privacy-policy/`, source `apps/landing/src/legal/privacy-policy.es.md`), bumped by
 * hand whenever that policy or the consent text materially changes. Never client-supplied (a
 * client claiming an earlier/different version would be worthless as evidence). Each
 * `ConsentRecord` keeps the version current at the moment it was given.
 * History: "2026-09-20" (consent text only, no published policy yet) → "2026-10-11" (policy
 * published on the public site and linked from the sign-up consent) → "2026-10-14" (deleting the
 * account always deletes everything; the "keep an anonymized history" option is gone). */
export const CURRENT_PRIVACY_POLICY_VERSION = "2026-10-14";
