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

import { accounts } from "@finance/contracts";

import { CurrentUser, type AuthUser } from "../../infra/auth/current-user.decorator";
import { JwtAuthGuard } from "../../infra/auth/jwt-auth.guard";
import { ZodValidationPipe } from "../../infra/http/zod-validation.pipe";
import { AccountsService } from "./accounts.service";
import { CardsService } from "./cards.service";

@Controller("accounts")
@UseGuards(JwtAuthGuard)
export class AccountsController {
  constructor(
    private readonly service: AccountsService,
    private readonly cards: CardsService,
  ) {}

  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(accounts.accountFiltersSchema)) filters: accounts.AccountFilters,
  ): Promise<accounts.BankAccount[]> {
    return this.service.list(user.id, filters);
  }

  @Get(":id")
  get(@CurrentUser() user: AuthUser, @Param("id") id: string): Promise<accounts.BankAccount> {
    return this.service.get(user.id, id);
  }

  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(accounts.createBankAccountSchema)) body: accounts.CreateBankAccount,
  ): Promise<accounts.BankAccount> {
    return this.service.create(user.id, body);
  }

  @Patch(":id")
  update(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(accounts.updateBankAccountSchema)) body: accounts.UpdateBankAccount,
  ): Promise<accounts.BankAccount> {
    return this.service.update(user.id, id, body);
  }

  @Post(":id/status")
  setStatus(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(accounts.setAccountStatusSchema)) body: accounts.SetAccountStatus,
  ): Promise<accounts.BankAccount> {
    return this.service.setStatus(user.id, id, body.status);
  }

  @Post(":id/reconcile")
  reconcile(@CurrentUser() user: AuthUser, @Param("id") id: string): Promise<accounts.BankAccount> {
    return this.service.reconcile(user.id, id);
  }

  @Post(":id/generate-statements")
  generateStatements(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
  ): Promise<accounts.CreditStatement[]> {
    return this.service.generateStatements(user.id, id);
  }

  @Get(":id/credit-statements")
  listCreditStatements(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
  ): Promise<accounts.CreditStatement[]> {
    return this.service.listCreditStatements(user.id, id);
  }

  @Post(":id/credit-statements/:statementId/pay")
  payCreditStatement(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Param("statementId") statementId: string,
    @Body(new ZodValidationPipe(accounts.payCreditStatementSchema)) body: accounts.PayCreditStatement,
  ): Promise<accounts.CreditStatement> {
    return this.service.payCreditStatement(user.id, id, statementId, body.fromAccountId);
  }

  @Patch(":id/credit-statements/:statementId")
  updateCreditStatement(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Param("statementId") statementId: string,
    @Body(new ZodValidationPipe(accounts.updateCreditStatementSchema)) body: accounts.UpdateCreditStatement,
  ): Promise<accounts.CreditStatement> {
    return this.service.updateCreditStatement(user.id, id, statementId, body.amount);
  }

  @Delete(":id")
  @HttpCode(204)
  remove(@CurrentUser() user: AuthUser, @Param("id") id: string): Promise<void> {
    return this.service.remove(user.id, id);
  }

  // --- Cards (sub-resource) ---

  @Post(":id/cards")
  addCard(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(accounts.createCardSchema)) body: accounts.CreateCard,
  ): Promise<accounts.Card> {
    return this.cards.create(user.id, id, body);
  }

  @Patch(":id/cards/:cardId")
  updateCard(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Param("cardId") cardId: string,
    @Body(new ZodValidationPipe(accounts.createCardSchema)) body: accounts.CreateCard,
  ): Promise<accounts.Card> {
    return this.cards.update(user.id, id, cardId, body);
  }

  @Delete(":id/cards/:cardId")
  @HttpCode(204)
  removeCard(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Param("cardId") cardId: string,
  ): Promise<void> {
    return this.cards.remove(user.id, id, cardId);
  }
}
