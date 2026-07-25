import { Module } from "@nestjs/common";
import { CqrsModule } from "@nestjs/cqrs";
import { JwtModule } from "@nestjs/jwt";

import { JwtAuthGuard } from "../../infra/auth/jwt-auth.guard";
import { CreateDebtHandler } from "./application/commands/create-debt.handler";
import { RegisterDebtPaymentHandler } from "./application/commands/register-debt-payment.handler";
import { RemoveDebtHandler } from "./application/commands/remove-debt.handler";
import { SettleDebtHandler } from "./application/commands/settle-debt.handler";
import { UndoDebtPaymentHandler } from "./application/commands/undo-debt-payment.handler";
import { UnsettleDebtHandler } from "./application/commands/unsettle-debt.handler";
import { UpdateDebtHandler } from "./application/commands/update-debt.handler";
import { GetDebtQueryHandler } from "./application/queries/get-debt.handler";
import { ListDebtsQueryHandler } from "./application/queries/list-debts.handler";
import { DEBT_REPOSITORY } from "./domain/ports/debt.repository.port";
import { PrismaDebtRepository } from "./infrastructure/prisma-debt.repository";
import { DebtsController } from "./presentation/debts.controller";

const commandHandlers = [
  CreateDebtHandler,
  UpdateDebtHandler,
  SettleDebtHandler,
  UnsettleDebtHandler,
  RegisterDebtPaymentHandler,
  UndoDebtPaymentHandler,
  RemoveDebtHandler,
];

const queryHandlers = [ListDebtsQueryHandler, GetDebtQueryHandler];

@Module({
  imports: [CqrsModule, JwtModule.register({})],
  controllers: [DebtsController],
  providers: [
    ...commandHandlers,
    ...queryHandlers,
    { provide: DEBT_REPOSITORY, useClass: PrismaDebtRepository },
    JwtAuthGuard,
  ],
  exports: [],
})
export class DebtsModule {}
