import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  UseGuards,
} from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";

import { wallet } from "@finance/contracts";

import { CurrentUser, type AuthUser } from "../../../infra/auth/current-user.decorator";
import { JwtAuthGuard } from "../../../infra/auth/jwt-auth.guard";
import { ZodParamsPipe } from "../../../infra/http/zod-params.pipe";
import { ZodValidationPipe } from "../../../infra/http/zod-validation.pipe";
import { AddWalletItemCommand } from "../application/commands/add-wallet-item.command";
import { RemoveWalletItemCommand } from "../application/commands/remove-wallet-item.command";
import { ReorderWalletCommand } from "../application/commands/reorder-wallet.command";
import { ListWalletQuery } from "../application/queries/list-wallet.query";
import { walletItemIdParamsSchema } from "./dto/wallet-item-id.params";

/**
 * Facade (FR-012): translates each HTTP request into a command/query and
 * dispatches it via `CommandBus`/`QueryBus` — never constructs an aggregate,
 * never calls a repository, never contains a business-rule `if`.
 */
@Controller("wallet")
@UseGuards(JwtAuthGuard)
export class WalletController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Get()
  list(@CurrentUser() user: AuthUser): Promise<wallet.WalletItem[]> {
    return this.queryBus.execute(new ListWalletQuery(user.id));
  }

  @Post()
  add(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(wallet.createWalletItemSchema)) body: wallet.CreateWalletItem,
  ): Promise<wallet.WalletItem> {
    return this.commandBus.execute(new AddWalletItemCommand(user.id, body));
  }

  @Patch("reorder")
  reorder(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(wallet.reorderWalletSchema)) body: wallet.ReorderWallet,
  ): Promise<wallet.WalletItem[]> {
    return this.commandBus.execute(new ReorderWalletCommand(user.id, body.ids));
  }

  @Delete(":id")
  @HttpCode(204)
  remove(
    @CurrentUser() user: AuthUser,
    @Param(new ZodParamsPipe(walletItemIdParamsSchema)) params: { id: string },
  ): Promise<void> {
    return this.commandBus.execute(new RemoveWalletItemCommand(user.id, params.id));
  }
}
