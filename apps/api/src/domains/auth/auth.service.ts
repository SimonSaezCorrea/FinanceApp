import { ConflictException, Injectable, Logger, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { compare, hash } from "bcryptjs";

import type { auth } from "@finance/contracts";

import type { AuthUser } from "../../infra/auth/current-user.decorator";
import { AuthRepository } from "./auth.repository";

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
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
    return this.issueTokens({ id: user.id, email: user.email });
  }

  async getCurrentUser(id: string): Promise<auth.CurrentUser> {
    const user = await this.repo.findById(id);
    if (!user) throw new UnauthorizedException({ code: "UNAUTHORIZED" });
    return { id: user.id, email: user.email, name: user.name };
  }
}
