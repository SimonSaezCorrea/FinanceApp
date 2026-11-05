import { Inject, Injectable } from "@nestjs/common";
import { QueryHandler } from "@nestjs/cqrs";

import type { auth } from "@finance/contracts";

import { BaseQueryHandler } from "../../../../infra/cqrs/base-query.handler";
import {
  TRUSTED_DEVICE_REPOSITORY,
  type TrustedDeviceRepositoryPort,
} from "../../../trusted-device/domain/ports/trusted-device.repository.port";
import { hashTrustedDeviceToken } from "../trusted-device-cookie";
import { ListTrustedDevicesQuery } from "./list-trusted-devices.query";

/** The account's remembered browsers that still skip the second factor (specs/040 US2). */
@Injectable()
@QueryHandler(ListTrustedDevicesQuery)
export class ListTrustedDevicesQueryHandler extends BaseQueryHandler<
  ListTrustedDevicesQuery,
  auth.ListTrustedDevicesResponse,
  null
> {
  constructor(
    @Inject(TRUSTED_DEVICE_REPOSITORY) private readonly devices: TrustedDeviceRepositoryPort,
  ) {
    super();
  }

  protected async loadContext(): Promise<null> {
    return null;
  }

  protected async handle(query: ListTrustedDevicesQuery): Promise<auth.ListTrustedDevicesResponse> {
    const currentHash = query.currentToken ? hashTrustedDeviceToken(query.currentToken) : null;
    const rows = await this.devices.listForUser(query.userId, new Date());
    return {
      items: rows.map((d) => ({
        id: d.id,
        deviceLabel: d.deviceLabel,
        createdAt: d.createdAt.toISOString(),
        expiresAt: d.expiresAt.toISOString(),
        lastUsedAt: d.lastUsedAt?.toISOString() ?? null,
        isCurrent: d.tokenHash === currentHash,
      })),
    };
  }
}
