import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";

import { JwtAuthGuard } from "../../infra/auth/jwt-auth.guard";
import { TransactionsController } from "./transactions.controller";
import { TransactionsRepository } from "./transactions.repository";
import { TransactionsService } from "./transactions.service";

@Module({
  imports: [JwtModule.register({})],
  controllers: [TransactionsController],
  providers: [TransactionsService, TransactionsRepository, JwtAuthGuard],
})
export class TransactionsModule {}
