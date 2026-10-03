import { Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Prisma, type User as UserRow } from "@prisma/client";

import { auth } from "@finance/contracts";

import { getMfaEncryptionKey } from "../../../infra/config/mfa.config";
import { PrismaService } from "../../../infra/prisma/prisma.service";
import {
  COUNTRY_LOOKUP,
  type CountryLookupPort,
} from "../../country/domain/ports/country-lookup.port";
import { decryptMfaSecret, encryptMfaSecret } from "../application/mfa-secret-cipher";
import { EmailTakenError, IdentifierTakenError } from "../domain/errors";
import { User, type UserProps } from "../domain/user.aggregate";
import type { UserRepositoryPort } from "../domain/ports/user.repository.port";

/** Maps a Postgres unique-constraint violation to the right domain error by WHICH column
 * collided — `email` and `identifierValue` are both unique, and conflating them would tell the
 * caller the wrong field failed. */
function rethrowUniqueViolation(err: unknown): never {
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
    const target = (err.meta?.target as string[] | undefined) ?? [];
    if (target.includes("identifierValue")) throw new IdentifierTakenError();
    throw new EmailTakenError();
  }
  throw err;
}

type Row = NonNullable<Awaited<ReturnType<PrismaService["user"]["findUnique"]>>> & {
  country?: { name: string } | null;
};

function rowToProps(row: Row, mfaEncryptionKey: string): UserProps {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    passwordHash: row.passwordHash,
    status: row.status,
    deletedAt: row.deletedAt,
    preferredCurrency: row.preferredCurrency as UserProps["preferredCurrency"],
    locale: row.locale as UserProps["locale"],
    theme: row.theme as UserProps["theme"],
    createdAt: row.createdAt,
    countryId: row.countryId,
    countryName: row.country?.name ?? null,
    addressStreet: row.addressStreet,
    addressCity: row.addressCity,
    addressRegion: row.addressRegion,
    addressPostalCode: row.addressPostalCode,
    birthDate: row.birthDate,
    identifierType: row.identifierType,
    identifierValue: row.identifierValue,
    phone: row.phone,
    hideBalances: row.hideBalances,
    extraCurrencies: row.extraCurrencies as UserProps["extraCurrencies"],
    budgetAlertThreshold: row.budgetAlertThreshold,
    mfaEnabled: row.mfaEnabled,
    // Decrypted here, at the adapter boundary — the domain layer only ever sees plaintext.
    mfaSecret: row.mfaSecretEncrypted
      ? decryptMfaSecret(row.mfaSecretEncrypted, mfaEncryptionKey)
      : null,
    mfaFailedAttempts: row.mfaFailedAttempts,
    mfaLockedUntil: row.mfaLockedUntil,
  };
}

/** Adapter (FR-011) — the only file in `auth` allowed to import `@prisma/client`. */
@Injectable()
export class PrismaUserRepository implements UserRepositoryPort {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    @Inject(COUNTRY_LOOKUP) private readonly countries: CountryLookupPort,
  ) {}

  async findByEmail(email: string): Promise<User | null> {
    const row = await this.prisma.user.findUnique({ where: { email }, include: { country: true } });
    return row
      ? User.fromPersistence(rowToProps(row as Row, getMfaEncryptionKey(this.config)))
      : null;
  }

  async findByIdentifierValue(identifierValue: string): Promise<User | null> {
    const row = await this.prisma.user.findUnique({
      where: { identifierValue },
      include: { country: true },
    });
    return row
      ? User.fromPersistence(rowToProps(row as Row, getMfaEncryptionKey(this.config)))
      : null;
  }

  async findById(id: string): Promise<User | null> {
    const row = await this.prisma.user.findUnique({ where: { id }, include: { country: true } });
    return row
      ? User.fromPersistence(rowToProps(row as Row, getMfaEncryptionKey(this.config)))
      : null;
  }

  async create(plan: {
    email: string;
    name?: string;
    passwordHash: string;
    birthDate: Date;
    identifierType?: auth.CurrentUser["identifierType"];
    identifierValue?: string | null;
  }): Promise<User> {
    // Normalized here, at the adapter boundary, same split `mfaSecret` encryption already
    // uses — the domain layer never has to know about dots/dashes.
    const identifierValue =
      plan.identifierType === "RUT" && plan.identifierValue
        ? auth.normalizeRut(plan.identifierValue)
        : (plan.identifierValue ?? null);
    try {
      const row = await this.prisma.user.create({
        data: { ...plan, identifierValue },
        include: { country: true },
      });
      return User.fromPersistence(rowToProps(row as Row, getMfaEncryptionKey(this.config)));
    } catch (err) {
      rethrowUniqueViolation(err);
    }
  }

  async save(user: User): Promise<void> {
    await this.saveWithTx(this.prisma, user);
  }

  async saveWithTx(tx: unknown, user: User): Promise<void> {
    const client = tx as PrismaService;
    const snap = user.snapshot();
    const mfaEncryptionKey = getMfaEncryptionKey(this.config);
    try {
      await client.user.update({
        where: { id: snap.id },
        data: {
          name: snap.name,
          email: snap.email,
          passwordHash: snap.passwordHash,
          status: snap.status,
          deletedAt: snap.deletedAt,
          preferredCurrency: snap.preferredCurrency,
          locale: snap.locale,
          theme: snap.theme,
          countryId: snap.countryId,
          addressStreet: snap.addressStreet,
          addressCity: snap.addressCity,
          addressRegion: snap.addressRegion,
          addressPostalCode: snap.addressPostalCode,
          birthDate: snap.birthDate,
          identifierType: snap.identifierType,
          // Normalized here too — a profile edit must keep the same canonical form the login
          // lookup expects, or a RUT re-typed with different dots/dash breaks its own login.
          identifierValue:
            snap.identifierType === "RUT" && snap.identifierValue
              ? auth.normalizeRut(snap.identifierValue)
              : snap.identifierValue,
          phone: snap.phone,
          hideBalances: snap.hideBalances,
          extraCurrencies: snap.extraCurrencies,
          budgetAlertThreshold: snap.budgetAlertThreshold,
          mfaEnabled: snap.mfaEnabled,
          // Encrypted here, at the adapter boundary — the domain layer only ever holds plaintext.
          mfaSecretEncrypted: snap.mfaSecret
            ? encryptMfaSecret(snap.mfaSecret, mfaEncryptionKey)
            : null,
          mfaFailedAttempts: snap.mfaFailedAttempts,
          mfaLockedUntil: snap.mfaLockedUntil,
        },
      });
    } catch (err) {
      // Defense-in-depth against a concurrent email/RUT change racing the
      // application layer's pre-check (mirrors the pre-migration
      // `AuthService.updateProfile`'s `P2002` catch).
      rethrowUniqueViolation(err);
    }
  }

  async findByIdForUpdateWithTx(tx: unknown, id: string): Promise<User | null> {
    const client = tx as PrismaService;
    const rows = await client.$queryRaw<UserRow[]>`
      SELECT * FROM "user" WHERE "id" = ${id} FOR UPDATE
    `;
    const row = rows[0];
    if (!row) return null;
    // The raw query has no join — resolve countryName separately (only queried, never locked;
    // MFA verification never mutates country, so it doesn't need to be part of the locked read).
    const countryName = row.countryId ? await this.countries.nameById(row.countryId) : null;
    return User.fromPersistence(
      rowToProps(
        { ...row, country: countryName ? { name: countryName } : null },
        getMfaEncryptionKey(this.config),
      ),
    );
  }

  countryName(id: string): Promise<string | null> {
    return this.countries.nameById(id);
  }

  async deleteWithTx(tx: unknown, id: string): Promise<void> {
    const client = tx as PrismaService;
    await client.user.delete({ where: { id } });
  }
}
