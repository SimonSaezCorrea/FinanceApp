import { Module } from "@nestjs/common";
import { CqrsModule } from "@nestjs/cqrs";
import { JwtModule } from "@nestjs/jwt";

import { JwtAuthGuard } from "../../infra/auth/jwt-auth.guard";
import { BankAccountDataModule } from "../bank-account/bank-account.data.module";
import { CardAccountDataModule } from "../card-account/card-account.data.module";
import { AddWalletItemHandler } from "./application/commands/add-wallet-item.handler";
import { RemoveWalletItemHandler } from "./application/commands/remove-wallet-item.handler";
import { ReorderWalletHandler } from "./application/commands/reorder-wallet.handler";
import { ListWalletQueryHandler } from "./application/queries/list-wallet.handler";
import { WALLET_ITEM_REPOSITORY } from "./domain/ports/wallet-item.repository.port";
import { PrismaWalletItemRepository } from "./infrastructure/prisma-wallet-item.repository";
import { WalletController } from "./presentation/wallet.controller";

const commandHandlers = [AddWalletItemHandler, ReorderWalletHandler, RemoveWalletItemHandler];

const queryHandlers = [ListWalletQueryHandler];

@Module({
  imports: [CqrsModule, JwtModule.register({}), BankAccountDataModule, CardAccountDataModule],
  controllers: [WalletController],
  providers: [
    ...commandHandlers,
    ...queryHandlers,
    { provide: WALLET_ITEM_REPOSITORY, useClass: PrismaWalletItemRepository },
    JwtAuthGuard,
  ],
  exports: [],
})
export class WalletItemDashboardModule {}
