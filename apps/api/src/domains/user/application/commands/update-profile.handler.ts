import { Inject, Injectable } from "@nestjs/common";
import { CommandHandler, EventBus } from "@nestjs/cqrs";

import type { auth } from "@finance/contracts";

import { BaseCommandHandler, type HandleResult } from "../../../../infra/cqrs/base-command.handler";
import {
  MFA_RECOVERY_CODE_REPOSITORY,
  type MfaRecoveryCodeRepositoryPort,
} from "../../../mfa-recovery-code/domain/ports/mfa-recovery-code.repository.port";
import { UnauthorizedError } from "../../domain/errors";
import { User } from "../../domain/user.aggregate";
import { USER_REPOSITORY, type UserRepositoryPort } from "../../domain/ports/user.repository.port";
import { UpdateProfileCommand } from "./update-profile.command";

/** Profile fields only — the email changes through `RequestEmailChangeHandler` (specs/032). */
@Injectable()
@CommandHandler(UpdateProfileCommand)
export class UpdateProfileHandler extends BaseCommandHandler<
  UpdateProfileCommand,
  auth.CurrentUser,
  User
> {
  constructor(
    eventBus: EventBus,
    @Inject(USER_REPOSITORY) private readonly repo: UserRepositoryPort,
    @Inject(MFA_RECOVERY_CODE_REPOSITORY)
    private readonly recoveryCodes: MfaRecoveryCodeRepositoryPort,
  ) {
    super(eventBus);
  }

  protected async loadContext(command: UpdateProfileCommand): Promise<User> {
    const user = await this.repo.findById(command.userId);
    if (!user) throw new UnauthorizedError();
    return user;
  }

  protected async handle(
    command: UpdateProfileCommand,
    user: User,
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
    return { result: user.toContract(remaining), events: [] };
  }

  protected override async persist(user: User): Promise<void> {
    // A concurrent RUT change racing another account surfaces here as IdentifierTakenError,
    // thrown by the Prisma adapter itself (the only file allowed to inspect a `P2002`).
    await this.repo.save(user);
  }
}
