import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../infra/prisma/prisma.service";
import type { IpGeolocationCacheEntry } from "../domain/ip-geolocation-cache.entity";
import type { IpGeolocationCacheRepositoryPort } from "../domain/ports/ip-geolocation-cache.repository.port";

/** Adapter (Principle VI) — the ONLY file allowed to import `@prisma/client` for the
 * `ip-geolocation-cache` table. */
@Injectable()
export class PrismaIpGeolocationCacheRepository implements IpGeolocationCacheRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  async findFreshByIp(ip: string, now: Date): Promise<IpGeolocationCacheEntry | null> {
    const row = await this.prisma.ipGeolocationCache.findFirst({
      where: { ip, expiresAt: { gt: now } },
    });
    return row ? { ip: row.ip, country: row.country, expiresAt: row.expiresAt } : null;
  }

  async upsert(entry: IpGeolocationCacheEntry): Promise<void> {
    await this.prisma.ipGeolocationCache.upsert({
      where: { ip: entry.ip },
      create: { ip: entry.ip, country: entry.country, expiresAt: entry.expiresAt },
      update: { country: entry.country, expiresAt: entry.expiresAt },
    });
  }

  async deleteExpired(now: Date): Promise<number> {
    const result = await this.prisma.ipGeolocationCache.deleteMany({
      where: { expiresAt: { lt: now } },
    });
    return result.count;
  }
}
