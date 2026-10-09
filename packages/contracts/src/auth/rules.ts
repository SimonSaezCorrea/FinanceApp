/**
 * The auth rules with no schema behind them — RUT check digit, age, the guardian threshold — as a
 * zod-free entry point (`@finance/contracts/auth-rules`), so the public site's access panel can
 * apply exactly the API's rules without shipping every contract (spec 031).
 */
export * from "./rut";

/** Full years elapsed as of `now` — pure, shared by the API's own registration validation and
 * the web registration form (deciding whether to show the guardian block), so the two can
 * never disagree about someone's age. Mirrors `User.toContract()`'s own `age` derivation. */
export function calculateAgeFromBirthDate(birthDate: Date, now = new Date()): number {
  let age = now.getFullYear() - birthDate.getFullYear();
  const monthDiff = now.getMonth() - birthDate.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < birthDate.getDate())) age--;
  return age;
}

/** Ley 21.719's reinforced regime for a minor's sensitive data: below this age, a guardian's
 * own authorization is required IN ADDITION to (never instead of) the titular's own
 * `sensitiveDataConsent`. Chile's mayoría de edad (18) — not independently verified against
 * the statute's own text for this specific threshold; treat as a working assumption pending
 * legal review, same caveat every compliance-cl-generated document in this repo carries. */
export const MINOR_GUARDIAN_THRESHOLD_AGE = 18;
