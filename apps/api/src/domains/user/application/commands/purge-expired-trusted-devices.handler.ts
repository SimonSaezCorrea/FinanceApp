import { Inject, Injectable } from "@nestjs/common";
import { CommandHandler, EventBus } from "@nestjs/cqrs";

import { BaseCommandHandler, type HandleResult } from "../../../../infra/cqrs/base-command.handler";
import {
  TRUSTED_DEVICE_REPOSITORY,
  type TrustedDeviceRepositoryPort,
} from "../../../trusted-device/domain/ports/trusted-device.repository.port";
import { PurgeExpiredTrustedDevicesCommand } from "./purge-expired-trusted-devices.command";

@Injectable()
@CommandHandler(PurgeExpiredTrustedDevicesCommand)
export class PurgeExpiredTrustedDevicesHandler extends BaseCommandHandler<
  PurgeExpiredTrustedDevicesCommand,
  number,
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

  protected async handle(
    command: PurgeExpiredTrustedDevicesCommand,
  ): Promise<HandleResult<number>> {
    return { result: await this.devices.purgeExpired(command.now), events: [] };
  }
}
