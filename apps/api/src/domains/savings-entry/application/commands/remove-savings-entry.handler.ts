import { Inject, Injectable } from "@nestjs/common";
import { CommandHandler, EventBus } from "@nestjs/cqrs";

import { BaseCommandHandler, type HandleResult } from "../../../../infra/cqrs/base-command.handler";
import { SavingsEntryNotFoundError } from "../../domain/errors";
import {
  SAVINGS_ENTRY_REPOSITORY,
  type SavingsEntryRepositoryPort,
} from "../../domain/ports/savings-entry.repository.port";
import { RemoveSavingsEntryCommand } from "./remove-savings-entry.command";

/** Deletes a contribution recorded by mistake — no compensating entry, no
 * synthetic reversal: this domain has no external ledger to reconcile
 * against, so leaving the error visible would be noise, not trazability
 * (see research.md §"Corrección de un aporte"). */
@Injectable()
@CommandHandler(RemoveSavingsEntryCommand)
export class RemoveSavingsEntryHandler extends BaseCommandHandler<
  RemoveSavingsEntryCommand,
  void,
  null
> {
  constructor(
    eventBus: EventBus,
    @Inject(SAVINGS_ENTRY_REPOSITORY) private readonly repo: SavingsEntryRepositoryPort,
  ) {
    super(eventBus);
  }

  protected async loadContext(): Promise<null> {
    return null;
  }

  protected async handle(command: RemoveSavingsEntryCommand): Promise<HandleResult<void>> {
    const ok = await this.repo.remove(command.userId, command.id);
    if (!ok) throw new SavingsEntryNotFoundError();
    return { result: undefined, events: [] };
  }
}
