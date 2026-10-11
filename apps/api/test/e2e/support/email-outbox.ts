import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import cookieParser from "cookie-parser";

import { AppModule } from "../../../src/app.module";
import { EMAIL_SENDER, type OutgoingEmail } from "../../../src/infra/email/email-sender.port";
import {
  InMemoryEmailSender,
  tokenFrom,
} from "../../../src/infra/email/senders/in-memory-email.sender";
import { AllExceptionsFilter } from "../../../src/infra/http/all-exceptions.filter";

/**
 * E2E (specs/032): the whole app with `EMAIL_SENDER` replaced by an in-memory outbox, so a test
 * can read the link an email carries — the same path a person follows from their inbox.
 */
export async function appWithOutbox(): Promise<{
  app: INestApplication;
  outbox: InMemoryEmailSender;
}> {
  const outbox = new InMemoryEmailSender();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(EMAIL_SENDER)
    .useValue(outbox)
    .compile();
  const app = moduleRef.createNestApplication();
  app.setGlobalPrefix("api/v1");
  app.use(cookieParser());
  app.useGlobalFilters(new AllExceptionsFilter());
  await app.init();
  return { app, outbox };
}

/** Waits for an email sent in the background (security notices, password recovery). */
export async function waitForEmail(
  outbox: InMemoryEmailSender,
  to: string,
  kind?: OutgoingEmail["kind"],
  subjectIncludes?: string,
  timeoutMs = 3000,
): Promise<OutgoingEmail> {
  const started = Date.now();
  for (;;) {
    const found = [...outbox.sent]
      .reverse()
      .find(
        (e) =>
          e.to === to &&
          (!kind || e.kind === kind) &&
          (!subjectIncludes || e.subject.includes(subjectIncludes)),
      );
    if (found) return found;
    if (Date.now() - started > timeoutMs) {
      throw new Error(`No ${kind ?? "email"} to ${to} within ${timeoutMs} ms`);
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

/** The token of the last email of a kind sent to `to`. */
export function lastToken(
  outbox: InMemoryEmailSender,
  to: string,
  kind: OutgoingEmail["kind"],
): string {
  const email = outbox.last(to, kind);
  const token = email ? tokenFrom(email) : null;
  if (!token) throw new Error(`No ${kind} link to ${to}`);
  return token;
}
