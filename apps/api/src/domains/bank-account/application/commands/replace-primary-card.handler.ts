import { Inject, Injectable } from "@nestjs/common";
import { CommandHandler, EventBus } from "@nestjs/cqrs";

import type { accounts } from "@finance/contracts";

import type { HandleResult } from "../../../../infra/cqrs/base-command.handler";
import {
  BaseIdempotentCommandHandler,
  type CompleteFn,
} from "../../../../infra/cqrs/base-idempotent-command.handler";
import { PrismaService } from "../../../../infra/prisma/prisma.service";
import {
  CREDIT_STATEMENT_LOOKUP,
  type CreditStatementLookupPort,
} from "../../../credit-statement/domain/ports/credit-statement-lookup.port";
import {
  IDEMPOTENCY_RECORD_REPOSITORY,
  type IdempotencyRecordRepositoryPort,
} from "../../../idempotency-record/domain/ports/idempotency-record.repository.port";
import {
  INSTALLMENT_PLAN_REPOSITORY,
  type InstallmentPlanRepositoryPort,
} from "../../../installment-plan/domain/ports/installment-plan.repository.port";
import {
  TRANSACTION_SUMS_REPOSITORY,
  type TransactionSumsRepositoryPort,
} from "../../../transaction/domain/ports/transaction-sums.repository.port";
import {
  AccountNotFoundError,
  CardNotPrimaryError,
  PrimaryCardHasHistoryError,
  PrimaryCardInvalidReplacementError,
} from "../../domain/errors";
import {
  BANK_ACCOUNT_REPOSITORY,
  type BankAccountRepositoryPort,
} from "../../domain/ports/bank-account.repository.port";
import { accountsToDtos } from "../queries/account-dto.mapper";
import { ReplacePrimaryCardCommand } from "./replace-primary-card.command";

/**
 * Deactivates or deletes the account's primary card, making another one primary in the same
 * step (spec 039, US3/US5) — the only way the primary stops being active or stops existing, so
 * the account always keeps an ACTIVE primary and can always be billed.
 *
 * The replacement is an ACTIVE CREDIT card of the same account (Principle II: checked against
 * the account aggregate loaded for this user, never trusted from the body), or a new card
 * created here. Deleting is refused while the card has movements or instalment plans: it is
 * deactivated instead, which keeps them linked to the plastic that made them.
 *
 * Retry-safe by Principle VII form (c): it can CREATE a card, so a replay must not create a
 * second one — the `Idempotency-Key` record is completed inside the same transaction as the
 * change and a replay answers the first response. The account row is read `FOR UPDATE` in that
 * transaction, so two concurrent replacements run one after the other: the second no longer
 * finds `cardId` as the primary (`CARD_NOT_PRIMARY`).
 */
@Injectable()
@CommandHandler(ReplacePrimaryCardCommand)
export class ReplacePrimaryCardHandler extends BaseIdempotentCommandHandler<
  ReplacePrimaryCardCommand,
  accounts.BankAccount,
  null
> {
  protected readonly operation = "card.replacePrimary";

  constructor(
    eventBus: EventBus,
    @Inject(IDEMPOTENCY_RECORD_REPOSITORY) records: IdempotencyRecordRepositoryPort,
    @Inject(BANK_ACCOUNT_REPOSITORY) private readonly accountRepo: BankAccountRepositoryPort,
    @Inject(TRANSACTION_SUMS_REPOSITORY) private readonly sumsRepo: TransactionSumsRepositoryPort,
    @Inject(INSTALLMENT_PLAN_REPOSITORY) private readonly plansRepo: InstallmentPlanRepositoryPort,
    @Inject(CREDIT_STATEMENT_LOOKUP) private readonly statements: CreditStatementLookupPort,
    private readonly prisma: PrismaService,
  ) {
    super(eventBus, records);
  }

  protected requestBody(command: ReplacePrimaryCardCommand): unknown {
    return { accountId: command.accountId, cardId: command.cardId, ...command.input };
  }

  protected async loadContext(command: ReplacePrimaryCardCommand): Promise<null> {
    if (command.input.action === "DELETE") {
      const [moved, planned] = await Promise.all([
        this.sumsRepo.existsForCard(command.userId, command.cardId),
        this.plansRepo.existsForCard(command.userId, command.cardId),
      ]);
      if (moved || planned) throw new PrimaryCardHasHistoryError();
    }
    return null;
  }

  protected async handleIdempotent(
    command: ReplacePrimaryCardCommand,
    _context: null,
    complete: CompleteFn<accounts.BankAccount>,
  ): Promise<HandleResult<accounts.BankAccount>> {
    const { userId, accountId, cardId, input } = command;
    const result = await this.prisma.$transaction(async (tx) => {
      const account = await this.accountRepo.findByIdForUpdateWithTx(tx, userId, accountId);
      if (!account) throw new AccountNotFoundError();
      const source = account.findCardOrThrow(cardId);
      if (!source.isPrimary) throw new CardNotPrimaryError();

      let replacementId: string;
      if ("cardId" in input.replacement) {
        if (input.replacement.cardId === cardId) throw new PrimaryCardInvalidReplacementError();
        replacementId = input.replacement.cardId;
      } else {
        const card = input.replacement.newCard;
        const plan = {
          name: card.name,
          kind: "CREDIT" as const,
          last4: card.last4,
          expiryMonth: card.expiryMonth,
          expiryYear: card.expiryYear,
          isActive: true,
          // Created as an additional card, then promoted: the one-primary index must never
          // see two at once.
          isPrimary: false,
          isVirtual: card.isVirtual ?? false,
          isAdditional: card.isAdditional ?? false,
          cardholderName: card.cardholderName ?? null,
          network: card.network ?? null,
          limits: [],
        };
        replacementId = await this.accountRepo.addCardWithTx(tx, userId, accountId, plan);
        account.attachCard({ id: replacementId, ...plan });
      }

      account.changePrimary(replacementId);
      if (input.action === "DEACTIVATE") {
        account.deactivateCard(cardId);
        await this.accountRepo.saveCardRolesWithTx(tx, account);
      } else {
        account.detachCard(cardId);
        // Deleted before the new primary is written, so the index never sees two.
        await this.accountRepo.removeCardWithTx(tx, userId, accountId, cardId);
        await this.accountRepo.saveCardRolesWithTx(tx, account);
      }

      // Shaped from the aggregate as it now stands: a fresh read would run outside `tx` and
      // couldn't see this transaction's writes yet.
      const [dto] = await accountsToDtos(
        this.sumsRepo,
        userId,
        [account],
        this.plansRepo,
        this.statements,
      );
      await complete(tx, dto);
      return dto;
    });
    return { result, events: [] };
  }
}
