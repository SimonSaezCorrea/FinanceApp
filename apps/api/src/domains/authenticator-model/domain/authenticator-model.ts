/**
 * `authenticator-model` table (specs/041): the FIDO Alliance Metadata Service catalog, one row per
 * authenticator model (AAGUID). Global reference data — no `userId`, nobody's personal data —,
 * replaced as a whole when a newer signed catalog arrives.
 */
export interface AuthenticatorModelProps {
  aaguid: string;
  description: string;
  /** The catalog's metadata statement, as published (loaded into the WebAuthn library). */
  statement: unknown;
  compromisedStatus: string | null;
  statusDate: Date | null;
}

/** A signed catalog, already verified, ready to replace the table. */
export interface AuthenticatorCatalog {
  number: number;
  nextUpdate: Date;
  models: AuthenticatorModelProps[];
}

export interface CatalogVersion {
  number: number;
  nextUpdate: Date;
}

/** A status report as the catalog publishes it (only the fields used here). */
export interface StatusReport {
  status: string;
  effectiveDate?: string;
}

/**
 * The statuses MDS3 defines as "don't trust this authenticator" (research R3): the four the
 * WebAuthn library already treats as compromised, plus `REVOKED`.
 */
export const COMPROMISE_STATUSES: ReadonlySet<string> = new Set([
  "REVOKED",
  "USER_VERIFICATION_BYPASS",
  "ATTESTATION_KEY_COMPROMISE",
  "USER_KEY_REMOTE_COMPROMISE",
  "USER_KEY_PHYSICAL_COMPROMISE",
]);

/**
 * The model's compromise status per its LATEST report (a maker may publish a fix afterwards), or
 * null. Reports without a date keep their published order; dated ones are compared by date.
 */
export function compromisedStatusOf(
  reports: readonly StatusReport[],
): { status: string; date: Date | null } | null {
  if (reports.length === 0) return null;
  let latest = reports[0]!;
  let latestIndex = 0;
  reports.forEach((report, index) => {
    const a = report.effectiveDate ? Date.parse(report.effectiveDate) : Number.NaN;
    const b = latest.effectiveDate ? Date.parse(latest.effectiveDate) : Number.NaN;
    const later = Number.isNaN(a) || Number.isNaN(b) ? index > latestIndex : a >= b;
    if (later) {
      latest = report;
      latestIndex = index;
    }
  });
  if (!COMPROMISE_STATUSES.has(latest.status)) return null;
  const date = latest.effectiveDate ? new Date(latest.effectiveDate) : null;
  return { status: latest.status, date: date && !Number.isNaN(date.getTime()) ? date : null };
}

/** Whether a stored catalog can still mark passkeys (FR-007: an expired copy only identifies). */
export function isCatalogCurrent(version: CatalogVersion, now: Date): boolean {
  return version.nextUpdate.getTime() > now.getTime();
}
