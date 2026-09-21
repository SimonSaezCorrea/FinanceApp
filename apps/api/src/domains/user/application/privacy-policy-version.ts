/** Server-defined identifier for "which version of the sensitive-data consent text was shown"
 * (Ley 21.719 Art. 16) — a date string, bumped by hand whenever that text materially changes.
 * Never client-supplied (a client claiming an earlier/different version would be worthless as
 * evidence). No live `/legal` privacy-policy page exists yet (tracked separately in
 * `docs/PENDING.md`/the compliance findings) — this version tag is independent of that and
 * doesn't need to wait for it. */
export const CURRENT_PRIVACY_POLICY_VERSION = "2026-09-20";
