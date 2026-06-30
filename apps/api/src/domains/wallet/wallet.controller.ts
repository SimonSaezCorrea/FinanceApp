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

import { wallet } from "@finance/contracts";

import { CurrentUser, type AuthUser } from "../../infra/auth/current-user.decorator";
import { JwtAuthGuard } from "../../infra/auth/jwt-auth.guard";
import { ZodValidationPipe } from "../../infra/http/zod-validation.pipe";
import { WalletService } from "./wallet.service";

@Controller("wallet")
@UseGuards(JwtAuthGuard)
export class WalletController {
  constructor(private readonly service: WalletService) {}

  @Get()
  list(@CurrentUser() user: AuthUser): Promise<wallet.WalletItem[]> {
    return this.service.list(user.id);
  }

  @Post()
  add(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(wallet.createWalletItemSchema)) body: wallet.CreateWalletItem,
  ): Promise<wallet.WalletItem> {
    return this.service.add(user.id, body);
  }

  @Patch("reorder")
  reorder(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(wallet.reorderWalletSchema)) body: wallet.ReorderWallet,
  ): Promise<wallet.WalletItem[]> {
    return this.service.reorder(user.id, body.ids);
  }

  @Delete(":id")
  @HttpCode(204)
  remove(@CurrentUser() user: AuthUser, @Param("id") id: string): Promise<void> {
    return this.service.remove(user.id, id);
  }
}
