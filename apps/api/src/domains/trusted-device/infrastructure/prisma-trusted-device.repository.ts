import { Injectable } from "@nestjs/common";

import { auth } from "@finance/contracts";

import { PrismaService } from "../../../infra/prisma/prisma.service";
import type { TrustedDevicePlan, TrustedDeviceProps } from "../domain/trusted-device.entity";
import type { TrustedDeviceRepositoryPort } from "../domain/ports/trusted-device.repository.port";

/** Adapter — the ONLY file that touches `prisma.trustedDevice`. */
@Injectable()
export class PrismaTrustedDeviceRepository implements TrustedDeviceRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  async rememberWithTx(tx: unknown, plan: TrustedDevicePlan): Promise<void> {
    const client = tx as PrismaService;
    await client.trustedDevice.create({ data: plan });
    const beyondCap = await client.trustedDevice.findMany({
      where: { userId: plan.userId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: auth.TRUSTED_DEVICE_MAX,
      select: { id: true },
    });
    if (beyondCap.length > 0) {
      await client.trustedDevice.deleteMany({ where: { id: { in: beyondCap.map((d) => d.id) } } });
    }
  }

  async findValidByTokenHash(tokenHash: string, now: Date): Promise<TrustedDeviceProps | null> {
    return this.prisma.trustedDevice.findFirst({ where: { tokenHash, expiresAt: { gt: now } } });
  }

  async touch(id: string, now: Date): Promise<void> {
    await this.prisma.trustedDevice.updateMany({ where: { id }, data: { lastUsedAt: now } });
  }

  async listForUser(userId: string, now: Date): Promise<TrustedDeviceProps[]> {
    return this.prisma.trustedDevice.findMany({
      where: { userId, expiresAt: { gt: now } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });
  }

  async deleteOwned(userId: string, id: string): Promise<boolean> {
    const result = await this.prisma.trustedDevice.deleteMany({ where: { id, userId } });
    return result.count > 0;
  }

  async deleteAllForUserWithTx(tx: unknown, userId: string): Promise<void> {
    const client = tx as PrismaService;
    await client.trustedDevice.deleteMany({ where: { userId } });
  }

  async purgeExpired(now: Date): Promise<number> {
    const result = await this.prisma.trustedDevice.deleteMany({
      where: { expiresAt: { lte: now } },
    });
    return result.count;
  }
}
