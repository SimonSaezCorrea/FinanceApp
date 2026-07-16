import { ConflictException, Injectable, Logger, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { Prisma } from "@prisma/client";
import { compare, hash } from "bcryptjs";

import { moneyToString } from "@finance/money";
import type { auth } from "@finance/contracts";

import type { AuthUser } from "../../infra/auth/current-user.decorator";
import { AuthRepository } from "./auth.repository";

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

/** Full years elapsed since birthDate (only the age is ever exposed, never the exact date). */
function calculateAge(birthDate: Date | null): number | null {
  if (!birthDate) return null;
  const now = new Date();
  let age = now.getFullYear() - birthDate.getFullYear();
  const monthDiff = now.getMonth() - birthDate.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < birthDate.getDate())) age--;
  return age;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly repo: AuthRepository,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async register(input: auth.RegisterRequest): Promise<AuthUser> {
    const email = input.email.toLowerCase();
    const existing = await this.repo.findByEmail(email);
    if (existing) throw new ConflictException({ code: "EMAIL_TAKEN", field: "email" });

    const passwordHash = await hash(input.password, 12);
    const user = await this.repo.create({ email, name: input.name, passwordHash });
    this.logger.log(`user registered: ${user.id}`);
    return { id: user.id, email: user.email };
  }

  async validateCredentials(input: auth.LoginRequest): Promise<AuthUser> {
    const user = await this.repo.findByEmail(input.email.toLowerCase());
    if (!user?.passwordHash || !(await compare(input.password, user.passwordHash))) {
      this.logger.warn(`failed login attempt for ${input.email.toLowerCase()}`);
      throw new UnauthorizedException({ code: "INVALID_CREDENTIALS" });
    }
    if (user.status === "DISABLED") {
      this.logger.warn(`login attempt on disabled account: ${user.id}`);
      throw new UnauthorizedException({ code: "ACCOUNT_DISABLED" });
    }
    this.logger.log(`user logged in: ${user.id}`);
    return { id: user.id, email: user.email };
  }

  issueTokens(user: AuthUser): TokenPair {
    const accessToken = this.jwt.sign(
      { sub: user.id, email: user.email },
      {
        secret: this.config.getOrThrow<string>("JWT_ACCESS_SECRET"),
        expiresIn: this.config.get<string>("JWT_ACCESS_EXPIRES") ?? "15m",
      },
    );
    const refreshToken = this.jwt.sign(
      { sub: user.id },
      {
        secret: this.config.getOrThrow<string>("JWT_REFRESH_SECRET"),
        expiresIn: this.config.get<string>("JWT_REFRESH_EXPIRES") ?? "7d",
      },
    );
    return { accessToken, refreshToken };
  }

  async rotateFromRefresh(refreshToken: string | undefined): Promise<TokenPair> {
    if (!refreshToken) throw new UnauthorizedException({ code: "NO_REFRESH_TOKEN" });
    let sub: string;
    try {
      const payload = this.jwt.verify<{ sub: string }>(refreshToken, {
        secret: this.config.getOrThrow<string>("JWT_REFRESH_SECRET"),
      });
      sub = payload.sub;
    } catch {
      throw new UnauthorizedException({ code: "INVALID_REFRESH_TOKEN" });
    }
    const user = await this.repo.findById(sub);
    if (!user) throw new UnauthorizedException({ code: "INVALID_REFRESH_TOKEN" });
    if (user.status === "DISABLED") throw new UnauthorizedException({ code: "ACCOUNT_DISABLED" });
    return this.issueTokens({ id: user.id, email: user.email });
  }

  async getCurrentUser(id: string): Promise<auth.CurrentUser> {
    const user = await this.repo.findById(id);
    if (!user) throw new UnauthorizedException({ code: "UNAUTHORIZED" });
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      preferredCurrency: user.preferredCurrency as auth.CurrentUser["preferredCurrency"],
      locale: user.locale as auth.CurrentUser["locale"],
      dateFormat: user.dateFormat as auth.CurrentUser["dateFormat"],
      theme: user.theme as auth.CurrentUser["theme"],
      memberSinceYear: user.createdAt.getFullYear(),
      countryId: user.countryId,
      countryName: user.country?.name ?? null,
      addressStreet: user.addressStreet,
      addressCity: user.addressCity,
      addressRegion: user.addressRegion,
      addressPostalCode: user.addressPostalCode,
      birthDate: user.birthDate ? user.birthDate.toISOString().slice(0, 10) : null,
      age: calculateAge(user.birthDate),
      identifierType: user.identifierType,
      identifierValue: user.identifierValue,
      phone: user.phone,
      hideBalances: user.hideBalances,
      monthlyBudgetTarget: user.monthlyBudgetTarget
        ? moneyToString(user.monthlyBudgetTarget.toString())
        : null,
      billingCycleStartDay: user.billingCycleStartDay,
      extraCurrencies: user.extraCurrencies as auth.CurrentUser["extraCurrencies"],
      budgetAlertThreshold: user.budgetAlertThreshold,
    };
  }

  async updateProfile(userId: string, input: auth.UpdateProfileRequest): Promise<auth.CurrentUser> {
    if (input.email) {
      const email = input.email.toLowerCase();
      const existing = await this.repo.findByEmail(email);
      if (existing && existing.id !== userId) {
        throw new ConflictException({ code: "EMAIL_TAKEN", field: "email" });
      }
    }
    try {
      // Prisma ignores `undefined`-valued fields in `update` (only `null` clears a column), so a
      // plain spread of the partial input is enough — no per-field presence checks needed.
      await this.repo.update(userId, {
        ...input,
        email: input.email ? input.email.toLowerCase() : input.email,
      });
    } catch (err) {
      // Defense-in-depth against a concurrent email change racing the pre-check above.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        throw new ConflictException({ code: "EMAIL_TAKEN", field: "email" });
      }
      throw err;
    }
    return this.getCurrentUser(userId);
  }

  async changePassword(userId: string, input: auth.ChangePasswordRequest): Promise<void> {
    const user = await this.repo.findById(userId);
    if (!user?.passwordHash || !(await compare(input.currentPassword, user.passwordHash))) {
      throw new UnauthorizedException({ code: "INVALID_CURRENT_PASSWORD" });
    }
    const passwordHash = await hash(input.newPassword, 12);
    await this.repo.update(userId, { passwordHash });
    this.logger.log(`password changed: ${userId}`);
  }

  async updatePreferences(
    userId: string,
    input: auth.UpdatePreferencesRequest,
  ): Promise<auth.CurrentUser> {
    await this.repo.update(userId, { ...input });
    return this.getCurrentUser(userId);
  }

  async deactivate(userId: string, input: auth.DeactivateRequest): Promise<void> {
    const user = await this.repo.findById(userId);
    if (!user?.passwordHash || !(await compare(input.password, user.passwordHash))) {
      throw new UnauthorizedException({ code: "INVALID_CURRENT_PASSWORD" });
    }
    // Only the status flag changes — no other field or related record is touched (FR-011).
    await this.repo.update(userId, { status: "DISABLED" });
    this.logger.log(`account deactivated: ${userId}`);
  }
}
