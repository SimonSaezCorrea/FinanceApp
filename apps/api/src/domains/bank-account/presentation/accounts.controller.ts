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

import { accounts } from "@finance/contracts";

import { CurrentUser, type AuthUser } from "../../../infra/auth/current-user.decorator";
import { JwtAuthGuard } from "../../../infra/auth/jwt-auth.guard";
import { ZodParamsPipe } from "../../../infra/http/zod-params.pipe";
import { ZodValidationPipe } from "../../../infra/http/zod-validation.pipe";
import { AddCardCommand } from "../application/commands/add-card.command";
import { LoadPrepaidCardCommand } from "../application/commands/load-prepaid-card.command";
import { CreateAccountCommand } from "../application/commands/create-account.command";
import { RemoveAccountCommand } from "../application/commands/remove-account.command";
import { RemoveCardCommand } from "../application/commands/remove-card.command";
import { SetAccountStatusCommand } from "../application/commands/set-account-status.command";
import { UpdateAccountCommand } from "../application/commands/update-account.command";
import { UpdateCardCommand } from "../application/commands/update-card.command";
import { GetAccountQuery } from "../application/queries/get-account.query";
import { ListAccountsQuery } from "../application/queries/list-accounts.query";
import { accountIdParamsSchema } from "./dto/account-id.params";
import { cardParamsSchema } from "./dto/card.params";

/**
 * Facade (FR-012): translates each HTTP request into a command/query and
 * dispatches it via `CommandBus`/`QueryBus` — never constructs an aggregate,
 * never calls a repository, never contains a business-rule `if`.
 */
@Controller("accounts")
@UseGuards(JwtAuthGuard)
export class AccountsController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(accounts.accountFiltersSchema)) filters: accounts.AccountFilters,
  ): Promise<accounts.BankAccount[]> {
    return this.queryBus.execute(new ListAccountsQuery(user.id, filters));
  }

  @Get(":id")
  get(
    @CurrentUser() user: AuthUser,
    @Param(new ZodParamsPipe(accountIdParamsSchema)) params: { id: string },
  ): Promise<accounts.BankAccount> {
    return this.queryBus.execute(new GetAccountQuery(user.id, params.id));
  }

  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(accounts.createBankAccountSchema)) body: accounts.CreateBankAccount,
  ): Promise<accounts.BankAccount> {
    return this.commandBus.execute(new CreateAccountCommand(user.id, body));
  }

  @Patch(":id")
  update(
    @CurrentUser() user: AuthUser,
    @Param(new ZodParamsPipe(accountIdParamsSchema)) params: { id: string },
    @Body(new ZodValidationPipe(accounts.updateBankAccountSchema)) body: accounts.UpdateBankAccount,
  ): Promise<accounts.BankAccount> {
    return this.commandBus.execute(new UpdateAccountCommand(user.id, params.id, body));
  }

  @Post(":id/status")
  setStatus(
    @CurrentUser() user: AuthUser,
    @Param(new ZodParamsPipe(accountIdParamsSchema)) params: { id: string },
    @Body(new ZodValidationPipe(accounts.setAccountStatusSchema)) body: accounts.SetAccountStatus,
  ): Promise<accounts.BankAccount> {
    return this.commandBus.execute(new SetAccountStatusCommand(user.id, params.id, body.status));
  }

  // Billing periods (`/accounts/:id/credit-statements*`, `/generate-statements`)
  // are served by `domains/credit-statement`'s own Facade — same URLs, different
  // table, different domain.

  @Delete(":id")
  @HttpCode(204)
  remove(
    @CurrentUser() user: AuthUser,
    @Param(new ZodParamsPipe(accountIdParamsSchema)) params: { id: string },
  ): Promise<void> {
    return this.commandBus.execute(new RemoveAccountCommand(user.id, params.id));
  }

  // --- Cards (sub-resource) ---

  @Post(":id/cards")
  addCard(
    @CurrentUser() user: AuthUser,
    @Param(new ZodParamsPipe(accountIdParamsSchema)) params: { id: string },
    @Body(new ZodValidationPipe(accounts.createCardSchema)) body: accounts.CreateCard,
  ): Promise<accounts.Card> {
    return this.commandBus.execute(new AddCardCommand(user.id, params.id, body));
  }

  @Patch(":id/cards/:cardId")
  updateCard(
    @CurrentUser() user: AuthUser,
    @Param(new ZodParamsPipe(cardParamsSchema)) params: { id: string; cardId: string },
    @Body(new ZodValidationPipe(accounts.createCardSchema)) body: accounts.CreateCard,
  ): Promise<accounts.Card> {
    return this.commandBus.execute(new UpdateCardCommand(user.id, params.id, params.cardId, body));
  }

  /** Load a PREPAID card from the account it belongs to (an expense + the card's
   *  own balance, atomically). */
  @Post(":id/cards/:cardId/load")
  loadPrepaidCard(
    @CurrentUser() user: AuthUser,
    @Param(new ZodParamsPipe(cardParamsSchema)) params: { id: string; cardId: string },
    @Body(new ZodValidationPipe(accounts.loadPrepaidCardSchema)) body: accounts.LoadPrepaidCard,
  ): Promise<accounts.Card> {
    return this.commandBus.execute(
      new LoadPrepaidCardCommand(
        user.id,
        params.id,
        params.cardId,
        body.amount,
        body.occurredAt ? new Date(body.occurredAt) : undefined,
      ),
    );
  }

  @Delete(":id/cards/:cardId")
  @HttpCode(204)
  removeCard(
    @CurrentUser() user: AuthUser,
    @Param(new ZodParamsPipe(cardParamsSchema)) params: { id: string; cardId: string },
  ): Promise<void> {
    return this.commandBus.execute(new RemoveCardCommand(user.id, params.id, params.cardId));
  }
}
