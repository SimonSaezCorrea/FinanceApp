// Novedades: what a version is. A version is one production deploy that brought release records,
// named `v<major>.<minor>` (`v1.1`, `v1.2`, …). v1.0 is the launch (2026-10-10), which has no
// records, so the first version with records is v1.1. Pure: no Node imports, so the app's bundle
// can use it too (src/ imports it).

/** The first version a record can belong to (v1.0 is the launch, without records). */
export const FIRST_VERSION = "1.1";

const VERSION = /^v?(\d{1,4})\.(\d{1,4})$/;

/** `"1.2"` or `"v1.2"` → `[1, 2]`; anything else → null. @param {string | null | undefined} value
 * @returns {[number, number] | null} */
export function parseVersion(value) {
  const match = VERSION.exec(value ?? "");
  return match ? [Number(match[1]), Number(match[2])] : null;
}

/** Orders versions numerically (`1.10` after `1.9`). A value that isn't a version sorts first.
 * @param {string | null | undefined} a @param {string | null | undefined} b @returns {number} */
export function compareVersions(a, b) {
  const x = parseVersion(a);
  const y = parseVersion(b);
  if (!x && !y) return 0;
  if (!x) return -1;
  if (!y) return 1;
  return x[0] - y[0] || x[1] - y[1];
}

/** The version after `last` (`1.2` → `1.3`), or the first one when there is none.
 * @param {string | null | undefined} last @returns {string} */
export function nextVersion(last) {
  const v = parseVersion(last);
  if (!v || compareVersions(last, FIRST_VERSION) < 0) return FIRST_VERSION;
  return `${v[0]}.${v[1] + 1}`;
}

/** The version's piece of an address: `1.2` → `v1-2`. @param {string} version @returns {string} */
export function versionSlug(version) {
  return `v${version.replace(".", "-")}`;
}

/** Today (or `date`) in Chile as `YYYY-MM-DD`: a deploy's day is Chile's day.
 * @param {Date} [date] @returns {string} */
export function chileDay(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Santiago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}
