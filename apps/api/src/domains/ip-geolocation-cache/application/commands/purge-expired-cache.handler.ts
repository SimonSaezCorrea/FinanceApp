import { Inject, Injectable } from "@nestjs/common";
import { CommandHandler, EventBus } from "@nestjs/cqrs";

import { BaseCommandHandler, type HandleResult } from "../../../../infra/cqrs/base-command.handler";
import {
  IP_GEOLOCATION_CACHE_REPOSITORY,
  type IpGeolocationCacheRepositoryPort,
} from "../../domain/ports/ip-geolocation-cache.repository.port";
import { PurgeExpiredCacheCommand } from "./purge-expired-cache.command";

/** Drops cache rows past their TTL, so the table doesn't grow without bound. */
@Injectable()
@CommandHandler(PurgeExpiredCacheCommand)
export class PurgeExpiredCacheHandler extends BaseCommandHandler<
  PurgeExpiredCacheCommand,
  number,
  null
> {
  constructor(
    eventBus: EventBus,
    @Inject(IP_GEOLOCATION_CACHE_REPOSITORY)
    private readonly repo: IpGeolocationCacheRepositoryPort,
  ) {
    super(eventBus);
  }

  protected async loadContext(): Promise<null> {
    return null;
  }

  protected async handle(command: PurgeExpiredCacheCommand): Promise<HandleResult<number>> {
    const deleted = await this.repo.deleteExpired(command.now);
    return { result: deleted, events: [] };
  }
}
