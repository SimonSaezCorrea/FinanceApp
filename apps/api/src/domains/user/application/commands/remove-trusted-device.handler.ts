import { Inject, Injectable } from "@nestjs/common";
import { CommandHandler, EventBus } from "@nestjs/cqrs";

import { BaseCommandHandler, type HandleResult } from "../../../../infra/cqrs/base-command.handler";
import {
  TRUSTED_DEVICE_REPOSITORY,
  type TrustedDeviceRepositoryPort,
} from "../../../trusted-device/domain/ports/trusted-device.repository.port";
import { TrustedDeviceNotFoundError } from "../../domain/errors";
import { RemoveTrustedDeviceCommand } from "./remove-trusted-device.command";

/**
 * Forgets one remembered browser (specs/040 US2): its next sign-in asks for the second factor
 * again. Scoped by the owner in the delete itself; someone else's id, or one already gone, is a
 * 404 — so a repeated request changes nothing (Constitution VII, form a).
 */
@Injectable()
@CommandHandler(RemoveTrustedDeviceCommand)
export class RemoveTrustedDeviceHandler extends BaseCommandHandler<
  RemoveTrustedDeviceCommand,
  void,
  null
> {
  constructor(
    eventBus: EventBus,
    @Inject(TRUSTED_DEVICE_REPOSITORY) private readonly devices: TrustedDeviceRepositoryPort,
  ) {
    super(eventBus);
  }

  protected async loadContext(): Promise<null> {
    return null;
  }

  protected async handle(command: RemoveTrustedDeviceCommand): Promise<HandleResult<void>> {
    const removed = await this.devices.deleteOwned(command.userId, command.deviceId);
    if (!removed) throw new TrustedDeviceNotFoundError();
    return { result: undefined, events: [] };
  }
}
