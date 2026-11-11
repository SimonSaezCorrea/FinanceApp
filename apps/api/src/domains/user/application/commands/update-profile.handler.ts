import { Inject, Injectable } from "@nestjs/common";
import { CommandHandler, EventBus } from "@nestjs/cqrs";

import { auth } from "@finance/contracts";

import { BaseCommandHandler, type HandleResult } from "../../../../infra/cqrs/base-command.handler";
import {
  MFA_RECOVERY_CODE_REPOSITORY,
  type MfaRecoveryCodeRepositoryPort,
} from "../../../mfa-recovery-code/domain/ports/mfa-recovery-code.repository.port";
import {
  SESSION_STEP_UP,
  type SessionStepUpPort,
} from "../../../session/domain/ports/session-step-up.port";
import { IdentifierRequiredError, UnauthorizedError } from "../../domain/errors";
import { AccountSecurityEvent } from "../../domain/events/account-security.event";
import { User } from "../../domain/user.aggregate";
import {
  USER_REPOSITORY,
  type UserRepositoryPort,
  type UserWriteField,
} from "../../domain/ports/user.repository.port";
import { assertRecentStepUp } from "../step-up";
import { UpdateProfileCommand } from "./update-profile.command";

/** The columns a profile edit owns. Only these are written (run-2): the user is read without a
 * lock, and a full save would put back the login/MFA counters, lockouts, password or second
 * factor that a locked write changed meanwhile. */
const PROFILE_FIELDS: readonly UserWriteField[] = [
  "name",
  "countryId",
  "addressStreet",
  "addressCity",
  "addressRegion",
  "addressPostalCode",
  "birthDate",
  "identifierType",
  "identifierValue",
  "phone",
];

/** How a login lookup compares identifiers (a RUT ignores dots, dash and the k's case). */
function canonical(type: string | null, value: string | null): string | null {
  if (!value) return null;
  return type === "RUT" ? auth.normalizeRut(value) : value;
}

interface Context {
  user: User;
  identifierChanged: boolean;
}

/**
 * Profile fields only — the email changes through `RequestEmailChangeHandler` (specs/032).
 *
 * The RUT is the login and password-recovery identifier (run-2): changing it needs a recent
 * step-up of the caller's session, it can never be cleared once set, and the change sends a
 * security notice.
 */
@Injectable()
@CommandHandler(UpdateProfileCommand)
export class UpdateProfileHandler extends BaseCommandHandler<
  UpdateProfileCommand,
  auth.CurrentUser,
  Context
> {
  constructor(
    eventBus: EventBus,
    @Inject(USER_REPOSITORY) private readonly repo: UserRepositoryPort,
    @Inject(MFA_RECOVERY_CODE_REPOSITORY)
    private readonly recoveryCodes: MfaRecoveryCodeRepositoryPort,
    @Inject(SESSION_STEP_UP) private readonly stepUp: SessionStepUpPort,
  ) {
    super(eventBus);
  }

  protected async loadContext(command: UpdateProfileCommand): Promise<Context> {
    const user = await this.repo.findById(command.userId);
    if (!user) throw new UnauthorizedError();
    const { input } = command;
    const before = user.snapshot();
    const nextType =
      input.identifierType !== undefined ? input.identifierType : before.identifierType;
    const nextValue =
      input.identifierValue !== undefined ? input.identifierValue : before.identifierValue;
    const current = canonical(before.identifierType, before.identifierValue);
    const next = canonical(nextType, nextValue);
    if (current && !next) throw new IdentifierRequiredError();
    const identifierChanged =
      current !== next || (current !== null && before.identifierType !== nextType);
    if (identifierChanged) {
      await assertRecentStepUp(this.stepUp, command.userId, command.sessionId);
    }
    return { user, identifierChanged };
  }

  protected async handle(
    command: UpdateProfileCommand,
    { user, identifierChanged }: Context,
  ): Promise<HandleResult<auth.CurrentUser>> {
    const { input } = command;
    // A linked country mirrors its name into `countryName` for display (same
    // precedent as `accounts`' `UpdateAccountHandler` resolving `institutionName`).
    const linkedName =
      input.countryId !== undefined && input.countryId
        ? await this.repo.countryName(input.countryId)
        : undefined;
    user.applyProfileUpdate({ ...input, countryName: linkedName });
    const remaining = user.mfaEnabled ? await this.recoveryCodes.countUnused(user.id) : 0;
    return {
      result: user.toContract(remaining),
      events: identifierChanged
        ? [new AccountSecurityEvent(user.id, "IDENTIFIER_CHANGED", new Date())]
        : [],
    };
  }

  protected override async persist({ user }: Context): Promise<void> {
    // A concurrent RUT change racing another account surfaces here as IdentifierTakenError,
    // thrown by the Prisma adapter itself (the only file allowed to inspect a `P2002`).
    await this.repo.saveFields(user, PROFILE_FIELDS);
  }
}
