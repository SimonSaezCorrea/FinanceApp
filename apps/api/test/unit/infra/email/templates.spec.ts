import { describe, expect, it } from "vitest";

import { en } from "../../../../src/infra/email/i18n/en";
import { es } from "../../../../src/infra/email/i18n/es";
import { renderResetPassword } from "../../../../src/infra/email/templates/reset-password";
import {
  renderSecurityNotice,
  type SecurityNoticeKind,
} from "../../../../src/infra/email/templates/security-notice";
import { renderVerifyEmail } from "../../../../src/infra/email/templates/verify-email";

function keys(value: unknown, prefix = ""): string[] {
  if (typeof value !== "object" || value === null) return [prefix];
  return Object.entries(value).flatMap(([k, v]) => keys(v, prefix ? `${prefix}.${k}` : k));
}

const base = { siteUrl: "https://mifik.cl", contact: "contacto@mifik.cl" };
const KINDS: SecurityNoticeKind[] = [
  "PASSWORD_CHANGED",
  "PASSWORD_RESET",
  "MFA_ENABLED",
  "MFA_DISABLED",
  "PASSKEY_ADDED",
  "PASSKEY_REMOVED",
  "EMAIL_CHANGED",
  "ACCOUNT_DELETED",
];

describe("email templates", () => {
  it("has the same keys in Spanish and English", () => {
    expect(keys(en).sort()).toEqual(keys(es).sort());
  });

  it("renders the verification email with its link in HTML and in plain text", () => {
    const link = "https://mifik.cl/es/verify-email/?token=abc";
    const out = renderVerifyEmail({ ...base, locale: "es", address: "simon@mifik.cl", link });
    expect(out.subject).toBe(es.verifyEmail.subject);
    expect(out.html).toContain(`href="${link}"`);
    expect(out.html).toContain('lang="es"');
    expect(out.text).toContain(link);
    expect(out.text).toContain("simon@mifik.cl");
    expect(out.text).not.toMatch(/<[a-z]/i);
  });

  it("writes the reset email in the account's language", () => {
    const out = renderResetPassword({ ...base, locale: "en", link: "https://mifik.cl/x" });
    expect(out.subject).toBe(en.resetPassword.subject);
    expect(out.text).toContain(en.resetPassword.expires);
  });

  it("escapes every interpolated value in the HTML", () => {
    const out = renderSecurityNotice({
      ...base,
      locale: "es",
      kind: "PASSKEY_ADDED",
      occurredAt: new Date("2026-10-10T15:00:00Z"),
      detail: '<script>alert("x")</script>',
    });
    expect(out.html).not.toContain("<script>");
    expect(out.html).toContain("&lt;script&gt;");
    expect(out.text).toContain('<script>alert("x")</script>');
  });

  it("renders every security notice with what happened, when (Chile time) and what to do", () => {
    for (const kind of KINDS) {
      const out = renderSecurityNotice({
        ...base,
        locale: "es",
        kind,
        occurredAt: new Date("2026-10-10T15:00:00Z"),
        detail: "x",
      });
      expect(out.subject).toBe(es.securityNotice.kinds[kind].subject);
      expect(out.text).toContain("12:00");
      expect(out.text).toContain("contacto@mifik.cl");
    }
  });

  it("never carries money", () => {
    const all = [
      renderVerifyEmail({ ...base, locale: "es", address: "a@b.cl", link: "https://x" }),
      renderResetPassword({ ...base, locale: "es", link: "https://x" }),
      ...KINDS.map((kind) =>
        renderSecurityNotice({ ...base, locale: "es", kind, occurredAt: new Date() }),
      ),
    ];
    for (const out of all) expect(out.text).not.toMatch(/\$\s?\d|CLP|USD|saldo/i);
  });
});
