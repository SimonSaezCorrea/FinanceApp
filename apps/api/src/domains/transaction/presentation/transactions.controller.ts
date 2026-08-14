import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";

import { transactions } from "@finance/contracts";

import { CurrentUser, type AuthUser } from "../../../infra/auth/current-user.decorator";
import { JwtAuthGuard } from "../../../infra/auth/jwt-auth.guard";
import { ZodParamsPipe } from "../../../infra/http/zod-params.pipe";
import { ZodValidationPipe } from "../../../infra/http/zod-validation.pipe";
import { CreateTransactionCommand } from "../application/commands/create-transaction.command";
import { CreateTransferCommand } from "../application/commands/create-transfer.command";
import { RemoveTransferCommand } from "../application/commands/remove-transfer.command";
import { UpdateTransferCommand } from "../application/commands/update-transfer.command";
import { GetTransferQuery } from "../application/queries/get-transfer.query";
import { transferGroupParamsSchema } from "./dto/transfer-group.params";
import { RemoveTransactionCommand } from "../application/commands/remove-transaction.command";
import { UpdateTransactionCommand } from "../application/commands/update-transaction.command";
import { GetTransactionQuery } from "../application/queries/get-transaction.query";
import { ListTransactionsQuery } from "../application/queries/list-transactions.query";
import { SummarizeTransactionsQuery } from "../application/queries/summarize-transactions.query";
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
  ): Promise<transactions.TransactionPage> {
    return this.queryBus.execute(new ListTransactionsQuery(user.id, filters));
  }

  // Declared BEFORE `:id` — Nest matches routes in order, so the reverse would
  // make this path arrive as `GetTransactionQuery("summary")`.
  @Get("summary")
  summary(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(transactions.transactionFiltersSchema))
    filters: transactions.TransactionFilters,
  ): Promise<transactions.TransactionSummary> {
    return this.queryBus.execute(new SummarizeTransactionsQuery(user.id, filters));
  }

  /* Transfers. Declared BEFORE `:id` for the same reason `summary` is: Nest
     matches in order and would otherwise read "transfers" as a movement id. */

  @Post("transfers")
  createTransfer(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(transactions.createTransferSchema))
    body: transactions.CreateTransfer,
  ): Promise<transactions.Transfer> {
    return this.commandBus.execute(new CreateTransferCommand(user.id, body));
  }

  @Get("transfers/:groupId")
  getTransfer(
    @CurrentUser() user: AuthUser,
    @Param(new ZodParamsPipe(transferGroupParamsSchema)) params: { groupId: string },
  ): Promise<transactions.Transfer> {
    return this.queryBus.execute(new GetTransferQuery(user.id, params.groupId));
  }

  @Patch("transfers/:groupId")
  updateTransfer(
    @CurrentUser() user: AuthUser,
    @Param(new ZodParamsPipe(transferGroupParamsSchema)) params: { groupId: string },
    @Body(new ZodValidationPipe(transactions.updateTransferSchema))
    body: transactions.UpdateTransfer,
  ): Promise<transactions.Transfer> {
    return this.commandBus.execute(new UpdateTransferCommand(user.id, params.groupId, body));
  }

  @Delete("transfers/:groupId")
  @HttpCode(204)
  removeTransfer(
    @CurrentUser() user: AuthUser,
    @Param(new ZodParamsPipe(transferGroupParamsSchema)) params: { groupId: string },
  ): Promise<void> {
    return this.commandBus.execute(new RemoveTransferCommand(user.id, params.groupId));
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
