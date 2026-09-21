import { hash } from "bcryptjs";
import { describe, expect, it, vi } from "vitest";

import { RegisterHandler } from "../../../../../../src/domains/user/application/commands/register.handler";
import { fakeBankAccountRepo } from "../../../../support/fake-ports";
import { RegisterCommand } from "../../../../../../src/domains/user/application/commands/register.command";
import { SessionIssuer } from "../../../../../../src/domains/user/application/session-issuer";
import { EmailTakenError } from "../../../../../../src/domains/user/domain/errors";
import { User, type UserProps } from "../../../../../../src/domains/user/domain/user.aggregate";
import type { UserRepositoryPort } from "../../../../../../src/domains/user/domain/ports/user.repository.port";
import type { ConsentRecordRepositoryPort } from "../../../../../../src/domains/consent-record/domain/ports/consent-record.repository.port";
import type { PrismaService } from "../../../../../../src/infra/prisma/prisma.service";
import type { ConfigService } from "@nestjs/config";

const ADULT_BIRTHDATE = new Date("1990-01-01T00:00:00Z");
const MINOR_BIRTHDATE = new Date(new Date().getFullYear() - 10, 0, 1); // always ~10 years old

function baseProps(overrides: Partial<UserProps> = {}): UserProps {
  return {
    id: "u1",
    email: "a@b.com",
    name: null,
    passwordHash: "hashed",
    status: "ACTIVE",
    deletedAt: null,
    preferredCurrency: "CLP",
    locale: "es",
    theme: "dark",
    createdAt: new Date("2024-01-01T00:00:00Z"),
    countryId: null,
    countryName: null,
    addressStreet: null,
    addressCity: null,
    addressRegion: null,
    addressPostalCode: null,
    birthDate: null,
    identifierType: null,
    identifierValue: null,
    phone: null,
    hideBalances: false,
    extraCurrencies: [],
    budgetAlertThreshold: 80,
    mfaEnabled: false,
    mfaSecret: null,
    mfaFailedAttempts: 0,
    mfaLockedUntil: null,
    ...overrides,
  };
}

function fakeRepo(overrides: Partial<UserRepositoryPort> = {}): UserRepositoryPort {
  return {
    findByEmail: vi.fn().mockResolvedValue(null),
    findById: vi.fn(),
    create: vi.fn(),
    save: vi.fn(),
    saveWithTx: vi.fn(),
    findByIdForUpdateWithTx: vi.fn(),
    countryName: vi.fn(),
    deleteWithTx: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function fakeSessionIssuer(): SessionIssuer {
  return {
    establish: vi
      .fn()
      .mockResolvedValue({ accessToken: "at", refreshToken: "rt", sessionId: "s1" }),
  } as unknown as SessionIssuer;
}

function fakeConsents(
  overrides: Partial<ConsentRecordRepositoryPort> = {},
): ConsentRecordRepositoryPort {
  return {
    createWithTx: vi.fn().mockResolvedValue(undefined),
    listByUser: vi.fn(),
    ...overrides,
  };
}

function fakeConfig(): ConfigService {
  return { getOrThrow: vi.fn().mockReturnValue("test-hmac-secret") } as unknown as ConfigService;
}

function fakePrisma(): PrismaService {
  return {} as unknown as PrismaService;
}

function buildHandler(
  overrides: {
    repo?: UserRepositoryPort;
    accounts?: ReturnType<typeof fakeBankAccountRepo>;
    consents?: ConsentRecordRepositoryPort;
    sessionIssuer?: SessionIssuer;
  } = {},
) {
  return new RegisterHandler(
    { publish: vi.fn() } as never,
    overrides.repo ?? fakeRepo(),
    overrides.accounts ?? fakeBankAccountRepo({ createWithCards: vi.fn() }),
    overrides.consents ?? fakeConsents(),
    overrides.sessionIssuer ?? fakeSessionIssuer(),
    fakePrisma(),
    fakeConfig(),
  );
}

describe("RegisterHandler", () => {
  it("hashes the password, lower-cases the email, and issues tokens", async () => {
    const create = vi.fn().mockResolvedValue(User.fromPersistence(baseProps()));
    const repo = fakeRepo({ findByEmail: vi.fn().mockResolvedValue(null), create });
    const accounts = fakeBankAccountRepo({ createWithCards: vi.fn() });
    const handler = buildHandler({ repo, accounts });

    const result = await handler.execute(
      new RegisterCommand({
        email: "A@B.com",
        password: "password123",
        birthDate: ADULT_BIRTHDATE,
        sensitiveDataConsent: true,
      }),
    );

    expect(result.user.email).toBe("a@b.com");
    expect(result.tokens).toEqual({ accessToken: "at", refreshToken: "rt", sessionId: "s1" });
    const arg = create.mock.calls[0]![0] as { email: string; passwordHash: string };
    expect(arg.email).toBe("a@b.com");
    expect(arg.passwordHash).not.toBe("password123");
    expect(await hash("password123", 1)).not.toBe(arg.passwordHash); // different salt, still a bcrypt hash
    // Cash is the account everyone already has: a new user starts with it, so a
    // cash expense can be recorded on day one without inventing an account first.
    const cash = (accounts.createWithCards as ReturnType<typeof vi.fn>).mock.calls[0]![1];
    expect(cash).toMatchObject({ type: "CASH", name: "Efectivo" });
  });

  it("records the reinforced consent (Ley 21.719 Art. 16) for the new user", async () => {
    const create = vi.fn().mockResolvedValue(User.fromPersistence(baseProps({ id: "u9" })));
    const repo = fakeRepo({ findByEmail: vi.fn().mockResolvedValue(null), create });
    const consents = fakeConsents();
    const handler = buildHandler({ repo, consents });

    await handler.execute(
      new RegisterCommand({
        email: "a@b.com",
        password: "password123",
        birthDate: ADULT_BIRTHDATE,
        sensitiveDataConsent: true,
      }),
    );

    expect(consents.createWithTx).toHaveBeenCalledWith(
      expect.anything(),
      "u9",
      "SENSITIVE_DATA_PROCESSING",
      expect.any(String),
    );
  });

  it("also records the guardian authorization for a minor titular", async () => {
    const create = vi.fn().mockResolvedValue(User.fromPersistence(baseProps({ id: "u10" })));
    const repo = fakeRepo({ findByEmail: vi.fn().mockResolvedValue(null), create });
    const consents = fakeConsents();
    const handler = buildHandler({ repo, consents });

    await handler.execute(
      new RegisterCommand({
        email: "kid@b.com",
        password: "password123",
        birthDate: MINOR_BIRTHDATE,
        sensitiveDataConsent: true,
        guardianAuthorization: {
          name: "Ana Madre",
          identifierValue: "11.111.111-1",
          relationship: "MOTHER",
          accepted: true,
        },
      }),
    );

    expect(consents.createWithTx).toHaveBeenCalledWith(
      expect.anything(),
      "u10",
      "SENSITIVE_DATA_PROCESSING",
      expect.any(String),
    );
    expect(consents.createWithTx).toHaveBeenCalledWith(
      expect.anything(),
      "u10",
      "MINOR_GUARDIAN_AUTHORIZATION",
      expect.any(String),
      expect.objectContaining({
        guardianName: "Ana Madre",
        guardianRelationship: "MOTHER",
        guardianIdentifierHash: expect.any(String),
      }),
    );
    const [, , , , guardianPlan] = (consents.createWithTx as ReturnType<typeof vi.fn>).mock
      .calls[1]!;
    expect(guardianPlan.guardianIdentifierHash).not.toBe("11.111.111-1");
  });

  it("does not record a guardian authorization for an adult titular", async () => {
    const create = vi.fn().mockResolvedValue(User.fromPersistence(baseProps({ id: "u11" })));
    const repo = fakeRepo({ findByEmail: vi.fn().mockResolvedValue(null), create });
    const consents = fakeConsents();
    const handler = buildHandler({ repo, consents });

    await handler.execute(
      new RegisterCommand({
        email: "a@b.com",
        password: "password123",
        birthDate: ADULT_BIRTHDATE,
        sensitiveDataConsent: true,
      }),
    );

    expect(consents.createWithTx).toHaveBeenCalledTimes(1);
  });

  it("throws EMAIL_TAKEN when the email already exists", async () => {
    const repo = fakeRepo({
      findByEmail: vi.fn().mockResolvedValue(User.fromPersistence(baseProps())),
    });
    const handler = buildHandler({ repo });

    await expect(
      handler.execute(
        new RegisterCommand({
          email: "a@b.com",
          password: "password123",
          birthDate: ADULT_BIRTHDATE,
          sensitiveDataConsent: true,
        }),
      ),
    ).rejects.toThrow(EmailTakenError);
  });
});
