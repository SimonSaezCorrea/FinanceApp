import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { isoBase64URL, isoCBOR } from "@simplewebauthn/server/helpers";
import cookieParser from "cookie-parser";

import { AppModule } from "../../../src/app.module";
import type {
  AuthenticatorCatalog,
  AuthenticatorModelProps,
  CatalogVersion,
} from "../../../src/domains/authenticator-model/domain/authenticator-model";
import {
  AUTHENTICATOR_MODEL_REPOSITORY,
  type AuthenticatorModelRepositoryPort,
} from "../../../src/domains/authenticator-model/domain/ports/authenticator-model.repository.port";
import { EMAIL_SENDER } from "../../../src/infra/email/email-sender.port";
import { InMemoryEmailSender } from "../../../src/infra/email/senders/in-memory-email.sender";
import { AllExceptionsFilter } from "../../../src/infra/http/all-exceptions.filter";

/**
 * E2E support (specs/041). The FIDO catalog is a GLOBAL table that other test files replace as a
 * whole, so these e2e use an in-memory catalog instead (the Prisma adapter has its own
 * integration test). A real authenticator can't be simulated: the library's verification is
 * stubbed by each test, and this builds the attestation object it would receive.
 */
export class InMemoryCatalog implements AuthenticatorModelRepositoryPort {
  version: CatalogVersion | null = {
    number: 1,
    nextUpdate: new Date(Date.now() + 30 * 86_400_000),
  };
  readonly models = new Map<string, AuthenticatorModelProps>();

  add(aaguid: string, description: string, compromisedStatus: string | null = null): void {
    this.models.set(aaguid, {
      aaguid,
      description,
      statement: { aaguid, description },
      compromisedStatus,
      statusDate: null,
    });
  }

  async currentCatalog() {
    return this.version;
  }
  async replaceAll(catalog: AuthenticatorCatalog) {
    this.version = { number: catalog.number, nextUpdate: catalog.nextUpdate };
    this.models.clear();
    for (const m of catalog.models) this.models.set(m.aaguid, m);
    return true;
  }
  async findByAaguid(aaguid: string) {
    return this.models.get(aaguid) ?? null;
  }
  async statements() {
    return [...this.models.values()].map((m) => m.statement);
  }
  async compromised() {
    return new Map(
      [...this.models.values()]
        .filter((m) => m.compromisedStatus)
        .map((m) => [m.aaguid, m.compromisedStatus!] as const),
    );
  }
}

export async function appWithCatalog(): Promise<{
  app: INestApplication;
  catalog: InMemoryCatalog;
  outbox: InMemoryEmailSender;
}> {
  const catalog = new InMemoryCatalog();
  const outbox = new InMemoryEmailSender();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(AUTHENTICATOR_MODEL_REPOSITORY)
    .useValue(catalog)
    .overrideProvider(EMAIL_SENDER)
    .useValue(outbox)
    .compile();
  const app = moduleRef.createNestApplication();
  app.setGlobalPrefix("api/v1");
  app.use(cookieParser());
  app.useGlobalFilters(new AllExceptionsFilter());
  await app.init();
  return { app, catalog, outbox };
}

/** A registration response whose attestation is `fmt` (with a certificate) for `aaguid`. */
export function attestedResponse(aaguid: string, fmt = "packed") {
  const aaguidBytes = Uint8Array.from(Buffer.from(aaguid.replace(/-/g, ""), "hex"));
  const publicKey = isoCBOR.encode(new Map<number, number>([[1, 2]]) as never);
  const authData = new Uint8Array([
    ...new Uint8Array(32),
    0x41,
    0,
    0,
    0,
    1,
    ...aaguidBytes,
    0,
    2,
    9,
    9,
    ...publicKey,
  ]);
  const attStmt =
    fmt === "none"
      ? new Map()
      : new Map<string, unknown>([
          ["x5c", [new Uint8Array([1])]],
          ["sig", new Uint8Array([2])],
        ]);
  const attestationObject = isoCBOR.encode(
    new Map<string, unknown>([
      ["fmt", fmt],
      ["attStmt", attStmt],
      ["authData", authData],
    ]) as never,
  );
  return {
    id: "cred",
    rawId: "cred",
    type: "public-key",
    clientExtensionResults: {},
    response: {
      clientDataJSON: "e30",
      attestationObject: isoBase64URL.fromBuffer(attestationObject),
    },
  };
}
