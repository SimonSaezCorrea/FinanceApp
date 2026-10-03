import { Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { CommandHandler, EventBus } from "@nestjs/cqrs";
import { hash } from "bcryptjs";

import { auth } from "@finance/contracts";

import { BaseCommandHandler, type HandleResult } from "../../../../infra/cqrs/base-command.handler";
import {
  getIdentifierHashSecret,
  hashIdentifier,
} from "../../../../infra/config/identifier-hash.config";
import { PrismaService } from "../../../../infra/prisma/prisma.service";
import {
  BANK_ACCOUNT_REPOSITORY,
  type BankAccountRepositoryPort,
} from "../../../bank-account/domain/ports/bank-account.repository.port";
import {
  CONSENT_RECORD_REPOSITORY,
  type ConsentRecordRepositoryPort,
} from "../../../consent-record/domain/ports/consent-record.repository.port";
import { EmailTakenError, IdentifierTakenError } from "../../domain/errors";
import { User } from "../../domain/user.aggregate";
import { USER_REPOSITORY, type UserRepositoryPort } from "../../domain/ports/user.repository.port";
import { CURRENT_PRIVACY_POLICY_VERSION } from "../privacy-policy-version";
import { SessionIssuer } from "../session-issuer";
import type { TokenPair } from "../token-issuer";
import { RegisterCommand } from "./register.command";

export interface AuthResult {
  tokens: TokenPair;
  user: auth.CurrentUser;
}

interface Context {
  passwordHash: string;
}

@Injectable()
@CommandHandler(RegisterCommand)
export class RegisterHandler extends BaseCommandHandler<RegisterCommand, AuthResult, Context> {
  constructor(
    eventBus: EventBus,
    @Inject(USER_REPOSITORY) private readonly repo: UserRepositoryPort,
    @Inject(BANK_ACCOUNT_REPOSITORY) private readonly accounts: BankAccountRepositoryPort,
    @Inject(CONSENT_RECORD_REPOSITORY) private readonly consents: ConsentRecordRepositoryPort,
    private readonly sessionIssuer: SessionIssuer,
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    super(eventBus);
  }

  protected async loadContext(command: RegisterCommand): Promise<Context> {
    const email = command.input.email.toLowerCase();
    const existing = await this.repo.findByEmail(email);
    if (existing) throw new EmailTakenError();
    // The RUT is now the login credential — same pre-check discipline as email above
    // (defense-in-depth against a genuine race lives in the Prisma adapter's own P2002 catch).
    const identifierValue = auth.normalizeRut(command.input.identifierValue);
    const existingByIdentifier = await this.repo.findByIdentifierValue(identifierValue);
    if (existingByIdentifier) throw new IdentifierTakenError();
    return { passwordHash: await hash(command.input.password, 12) };
  }

  protected async handle(
    command: RegisterCommand,
    context: Context,
  ): Promise<HandleResult<AuthResult>> {
    const plan = User.planRegistration({ ...command.input, passwordHash: context.passwordHash });
    const user = await this.repo.create(plan);
    // The user has no currency preference yet at registration time; CLP is the
    // app default (the same one `User.preferredCurrency` starts with).
    await this.createCashAccount(user.id, "CLP");
    // Ley 21.719 Art. 16: the checkbox is mandatory (`sensitiveDataConsent: z.literal(true)`
    // already rejected the request otherwise) — this is the record proving it was granted, and
    // when/under which policy text.
    await this.consents.createWithTx(
      this.prisma,
      user.id,
      "SENSITIVE_DATA_PROCESSING",
      CURRENT_PRIVACY_POLICY_VERSION,
    );
    // Ley 21.719 reinforced regime for minors: below the threshold, the request already
    // failed validation without a `guardianAuthorization` block (registerRequestSchema's own
    // cross-field refine) — this is the ADDITIONAL record proving the guardian's own
    // authorization, never a replacement for the titular's own consent above.
    if (command.input.guardianAuthorization) {
      const { name, identifierValue, relationship } = command.input.guardianAuthorization;
      await this.consents.createWithTx(
        this.prisma,
        user.id,
        "MINOR_GUARDIAN_AUTHORIZATION",
        CURRENT_PRIVACY_POLICY_VERSION,
        {
          guardianName: name,
          guardianIdentifierHash: hashIdentifier(
            identifierValue,
            getIdentifierHashSecret(this.config),
          ),
          guardianRelationship: relationship,
        },
      );
    }
    const tokens = await this.sessionIssuer.establish(
      { id: user.id, email: user.email },
      { userAgent: command.device?.userAgent, ip: command.device?.ip },
    );
    return { result: { tokens, user: user.toContract() }, events: [] };
  }

  /**
   * Cash is the account everyone already has — the notes in a wallet exist whether
   * or not an app models them. Creating it here means a new user can record a cash
   * expense on day one without first inventing an account for it, and removal is
   * refused while it is the only one (`CASH_ACCOUNT_REQUIRED`).
   */
  private async createCashAccount(userId: string, currency: string): Promise<void> {
    await this.accounts.createWithCards(userId, {
      name: "Efectivo",
      type: "CASH",
      status: "ACTIVE",
      currency,
      institution: null,
      institutionId: null,
      accountNumber: null,
      accountAlias: null,
      initialBalance: "0",
      overdraftLimit: "0",
      balanceCeiling: null,
      creditLimit: "0",
      creditUsedInitial: "0",
      billingCycleDay: null,
      paymentMethod: "MANUAL",
      cards: [],
    });
  }
}
