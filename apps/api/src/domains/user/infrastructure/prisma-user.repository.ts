import { Inject, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";

import { PrismaService } from "../../../infra/prisma/prisma.service";
import { COUNTRY_LOOKUP, type CountryLookupPort } from "../../country/domain/ports/country-lookup.port";
import { EmailTakenError } from "../domain/errors";
import { User, type UserProps } from "../domain/user.aggregate";
import type { UserRepositoryPort } from "../domain/ports/user.repository.port";

type Row = NonNullable<Awaited<ReturnType<PrismaService["user"]["findUnique"]>>> & {
  country?: { name: string } | null;
};

function rowToProps(row: Row): UserProps {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    passwordHash: row.passwordHash,
    status: row.status,
    preferredCurrency: row.preferredCurrency as UserProps["preferredCurrency"],
    locale: row.locale as UserProps["locale"],
    dateFormat: row.dateFormat as UserProps["dateFormat"],
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
    monthlyBudgetTarget: row.monthlyBudgetTarget ? row.monthlyBudgetTarget.toString() : null,
    billingCycleStartDay: row.billingCycleStartDay,
    extraCurrencies: row.extraCurrencies as UserProps["extraCurrencies"],
    budgetAlertThreshold: row.budgetAlertThreshold,
  };
}

/** Adapter (FR-011) — the only file in `auth` allowed to import `@prisma/client`. */
@Injectable()
export class PrismaUserRepository implements UserRepositoryPort {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(COUNTRY_LOOKUP) private readonly countries: CountryLookupPort,
  ) {}

  async findByEmail(email: string): Promise<User | null> {
    const row = await this.prisma.user.findUnique({ where: { email }, include: { country: true } });
    return row ? User.fromPersistence(rowToProps(row as Row)) : null;
  }

  async findById(id: string): Promise<User | null> {
    const row = await this.prisma.user.findUnique({ where: { id }, include: { country: true } });
    return row ? User.fromPersistence(rowToProps(row as Row)) : null;
  }

  async create(plan: { email: string; name?: string; passwordHash: string }): Promise<User> {
    const row = await this.prisma.user.create({ data: plan, include: { country: true } });
    return User.fromPersistence(rowToProps(row as Row));
  }

  async save(user: User): Promise<void> {
    const snap = user.snapshot();
    try {
      await this.prisma.user.update({
        where: { id: snap.id },
        data: {
          name: snap.name,
          email: snap.email,
          passwordHash: snap.passwordHash,
          status: snap.status,
          preferredCurrency: snap.preferredCurrency,
          locale: snap.locale,
          dateFormat: snap.dateFormat,
          theme: snap.theme,
          countryId: snap.countryId,
          addressStreet: snap.addressStreet,
          addressCity: snap.addressCity,
          addressRegion: snap.addressRegion,
          addressPostalCode: snap.addressPostalCode,
          birthDate: snap.birthDate,
          identifierType: snap.identifierType,
          identifierValue: snap.identifierValue,
          phone: snap.phone,
          hideBalances: snap.hideBalances,
          monthlyBudgetTarget: snap.monthlyBudgetTarget,
          billingCycleStartDay: snap.billingCycleStartDay,
          extraCurrencies: snap.extraCurrencies,
          budgetAlertThreshold: snap.budgetAlertThreshold,
        },
      });
    } catch (err) {
      // Defense-in-depth against a concurrent email change racing the
      // application layer's pre-check (mirrors the pre-migration
      // `AuthService.updateProfile`'s `P2002` catch).
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        throw new EmailTakenError();
      }
      throw err;
    }
  }

  countryName(id: string): Promise<string | null> {
    return this.countries.nameById(id);
  }
}
