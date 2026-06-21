import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";

import { JwtAuthGuard } from "../../infra/auth/jwt-auth.guard";
import { WalletController } from "./wallet.controller";
import { WalletRepository } from "./wallet.repository";
import { WalletService } from "./wallet.service";

@Module({
  imports: [JwtModule.register({})],
  controllers: [WalletController],
  providers: [WalletService, WalletRepository, JwtAuthGuard],
})
export class WalletModule {}
