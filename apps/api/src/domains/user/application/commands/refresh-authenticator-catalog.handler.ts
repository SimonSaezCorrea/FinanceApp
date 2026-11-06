import { Injectable } from "@nestjs/common";
import { CommandHandler, EventBus } from "@nestjs/cqrs";

import { BaseCommandHandler, type HandleResult } from "../../../../infra/cqrs/base-command.handler";
import { AuthenticatorCatalog, type CatalogRefreshOutcome } from "../authenticator-catalog";
import { RefreshAuthenticatorCatalogCommand } from "./refresh-authenticator-catalog.command";

@Injectable()
@CommandHandler(RefreshAuthenticatorCatalogCommand)
export class RefreshAuthenticatorCatalogHandler extends BaseCommandHandler<
  RefreshAuthenticatorCatalogCommand,
  CatalogRefreshOutcome,
  null
> {
  constructor(
    eventBus: EventBus,
    private readonly catalog: AuthenticatorCatalog,
  ) {
    super(eventBus);
  }

  protected async loadContext(): Promise<null> {
    return null;
  }

  protected async handle(
    command: RefreshAuthenticatorCatalogCommand,
  ): Promise<HandleResult<CatalogRefreshOutcome>> {
    return {
      result: await this.catalog.refresh({ onlyIfEmpty: command.onlyIfEmpty }),
      events: [],
    };
  }
}
