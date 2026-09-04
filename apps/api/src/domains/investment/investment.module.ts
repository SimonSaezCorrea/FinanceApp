import { Module } from "@nestjs/common";
import { CqrsModule } from "@nestjs/cqrs";
import { JwtModule } from "@nestjs/jwt";

import { JwtAuthGuard } from "../../infra/auth/jwt-auth.guard";
import { BankAccountDataModule } from "../bank-account/bank-account.data.module";
import { CreateInvestmentHandler } from "./application/commands/create-investment.handler";
import { RemoveInvestmentHandler } from "./application/commands/remove-investment.handler";
import { UpdateInvestmentHandler } from "./application/commands/update-investment.handler";
import { GetInvestmentQueryHandler } from "./application/queries/get-investment.handler";
import { ListInvestmentsQueryHandler } from "./application/queries/list-investments.handler";
import { INVESTMENT_REPOSITORY } from "./domain/ports/investment.repository.port";
import { PrismaInvestmentRepository } from "./infrastructure/prisma-investment.repository";
import { InvestmentsController } from "./presentation/investments.controller";

const commandHandlers = [CreateInvestmentHandler, UpdateInvestmentHandler, RemoveInvestmentHandler];

const queryHandlers = [ListInvestmentsQueryHandler, GetInvestmentQueryHandler];

@Module({
  imports: [CqrsModule, JwtModule.register({}), BankAccountDataModule],
  controllers: [InvestmentsController],
  providers: [
    ...commandHandlers,
    ...queryHandlers,
    { provide: INVESTMENT_REPOSITORY, useClass: PrismaInvestmentRepository },
    JwtAuthGuard,
  ],
  exports: [],
})
export class InvestmentModule {}
