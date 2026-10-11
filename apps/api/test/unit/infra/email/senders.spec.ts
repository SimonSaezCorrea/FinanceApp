import { afterEach, describe, expect, it, vi } from "vitest";

import type { OutgoingEmail } from "../../../../src/infra/email/email-sender.port";
import { ResendEmailSender } from "../../../../src/infra/email/senders/resend-email.sender";

const email: OutgoingEmail = {
  id: "01a128bd-a70c-7e03-b071-0d9afd8d9c5f",
  kind: "verify-email",
  to: "simon@mifik.cl",
  locale: "es",
  subject: "Confirma tu correo en fik",
  html: "<p>Hola</p>",
  text: "Confirmar: http://localhost:4321/es/verify-email/?token=abc",
};

afterEach(() => vi.unstubAllGlobals());

describe("ResendEmailSender", () => {
  it("posts the email to Resend with the key, the sender and an idempotency key", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, text: () => Promise.resolve("") });
    vi.stubGlobal("fetch", fetchMock);

    await new ResendEmailSender("re_key", "fik <no-reply@mifik.cl>", "contacto@mifik.cl").send(
      email,
    );

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.resend.com/emails");
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer re_key");
    expect(headers["Idempotency-Key"]).toBe(email.id);
    expect(JSON.parse(init.body as string)).toMatchObject({
      from: "fik <no-reply@mifik.cl>",
      to: ["simon@mifik.cl"],
      reply_to: "contacto@mifik.cl",
      subject: email.subject,
      html: email.html,
      text: email.text,
    });
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("throws when Resend rejects the email, without exposing the key", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 403, text: () => Promise.resolve("domain") }),
    );
    const sender = new ResendEmailSender("re_secret", "a@b.cl", "c@d.cl");
    await expect(sender.send(email)).rejects.toThrow(/403/);
    await expect(sender.send(email)).rejects.not.toThrow(/re_secret/);
  });
});
