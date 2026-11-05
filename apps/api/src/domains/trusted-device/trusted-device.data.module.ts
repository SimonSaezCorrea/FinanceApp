import { Module } from "@nestjs/common";

import { TRUSTED_DEVICE_REPOSITORY } from "./domain/ports/trusted-device.repository.port";
import { PrismaTrustedDeviceRepository } from "./infrastructure/prisma-trusted-device.repository";

/**
 * Data module for the `trusted-device` table (specs/040). A LEAF: one port→adapter binding,
 * importing no other domain — `user` composes it.
 */
@Module({
  providers: [{ provide: TRUSTED_DEVICE_REPOSITORY, useClass: PrismaTrustedDeviceRepository }],
  exports: [TRUSTED_DEVICE_REPOSITORY],
})
export class TrustedDeviceDataModule {}
