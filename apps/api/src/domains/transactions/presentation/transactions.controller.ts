import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";

import { transactions } from "@finance/contracts";

import { CurrentUser, type AuthUser } from "../../../infra/auth/current-user.decorator";
import { JwtAuthGuard } from "../../../infra/auth/jwt-auth.guard";
import { ZodParamsPipe } from "../../../infra/http/zod-params.pipe";
import { ZodValidationPipe } from "../../../infra/http/zod-validation.pipe";
import { CreateTransactionCommand } from "../application/commands/create-transaction.command";
import { RemoveTransactionCommand } from "../application/commands/remove-transaction.command";
import { UpdateTransactionCommand } from "../application/commands/update-transaction.command";
import { GetTransactionQuery } from "../application/queries/get-transaction.query";
import { ListTransactionsQuery } from "../application/queries/list-transactions.query";
import { transactionIdParamsSchema } from "./dto/transaction-id.params";

/**
 * Facade (FR-012): translates each HTTP request into a command/query and
 * dispatches it via `CommandBus`/`QueryBus` — never constructs an aggregate,
 * never calls a repository, never contains a business-rule `if`.
 */
@Controller("transactions")
@UseGuards(JwtAuthGuard)
export class TransactionsController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(transactions.transactionFiltersSchema))
    filters: transactions.TransactionFilters,
  ): Promise<transactions.Transaction[]> {
    return this.queryBus.execute(new ListTransactionsQuery(user.id, filters));
  }

  @Get(":id")
  get(
    @CurrentUser() user: AuthUser,
    @Param(new ZodParamsPipe(transactionIdParamsSchema)) params: { id: string },
  ): Promise<transactions.Transaction> {
    return this.queryBus.execute(new GetTransactionQuery(user.id, params.id));
  }

  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(transactions.createTransactionSchema))
    body: transactions.CreateTransaction,
  ): Promise<transactions.Transaction> {
    return this.commandBus.execute(new CreateTransactionCommand(user.id, body));
  }

  @Patch(":id")
  update(
    @CurrentUser() user: AuthUser,
    @Param(new ZodParamsPipe(transactionIdParamsSchema)) params: { id: string },
    @Body(new ZodValidationPipe(transactions.updateTransactionSchema))
    body: transactions.UpdateTransaction,
  ): Promise<transactions.Transaction> {
    return this.commandBus.execute(new UpdateTransactionCommand(user.id, params.id, body));
  }

  @Delete(":id")
  @HttpCode(204)
  remove(
    @CurrentUser() user: AuthUser,
    @Param(new ZodParamsPipe(transactionIdParamsSchema)) params: { id: string },
  ): Promise<void> {
    return this.commandBus.execute(new RemoveTransactionCommand(user.id, params.id));
  }
}
