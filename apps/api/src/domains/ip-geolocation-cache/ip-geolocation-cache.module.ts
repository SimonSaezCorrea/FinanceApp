import { Module } from "@nestjs/common";
import { CqrsModule } from "@nestjs/cqrs";

import { PurgeExpiredCacheHandler } from "./application/commands/purge-expired-cache.handler";
import { IpGeolocationCacheDataModule } from "./ip-geolocation-cache.data.module";

/**
 * Orchestration module: the handler this domain owns. It imports the leaf, never the other way
 * round. No controller — the mechanism is invisible over HTTP by design, same as
 * `idempotency-record`. Its only command is the cron's purge.
 */
@Module({
  imports: [CqrsModule, IpGeolocationCacheDataModule],
  providers: [PurgeExpiredCacheHandler],
  exports: [IpGeolocationCacheDataModule],
})
export class IpGeolocationCacheModule {}
