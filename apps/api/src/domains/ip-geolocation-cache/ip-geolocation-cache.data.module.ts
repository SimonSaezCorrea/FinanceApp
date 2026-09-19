import { Module } from "@nestjs/common";

import { IP_GEOLOCATION_CACHE_REPOSITORY } from "./domain/ports/ip-geolocation-cache.repository.port";
import { PrismaIpGeolocationCacheRepository } from "./infrastructure/prisma-ip-geolocation-cache.repository";

/**
 * Leaf data module for the `ip-geolocation-cache` table. Imports no other domain, so `user`
 * (which injects this port straight into `GeoIpLookup`) can depend on it without creating a
 * cycle — orchestration depends on leaves, never the reverse (Principle VI).
 */
@Module({
  providers: [
    { provide: IP_GEOLOCATION_CACHE_REPOSITORY, useClass: PrismaIpGeolocationCacheRepository },
  ],
  exports: [IP_GEOLOCATION_CACHE_REPOSITORY],
})
export class IpGeolocationCacheDataModule {}
