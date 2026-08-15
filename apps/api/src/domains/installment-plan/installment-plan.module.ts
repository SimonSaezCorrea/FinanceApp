import { Module } from "@nestjs/common";
import { CqrsModule } from "@nestjs/cqrs";
import { JwtModule } from "@nestjs/jwt";

import { JwtAuthGuard } from "../../infra/auth/jwt-auth.guard";
import { CardAccountDataModule } from "../card-account/card-account.data.module";
import { InstallmentPaymentDataModule } from "../installment-payment/installment-payment.data.module";
import { TransactionDataModule } from "../transaction/transaction.data.module";
import { CreateInstallmentPlanHandler } from "./application/commands/create-installment-plan.handler";
import { PayInstallmentHandler } from "./application/commands/pay-installment.handler";
import { RemoveInstallmentPlanHandler } from "./application/commands/remove-installment-plan.handler";
import { UnpayInstallmentHandler } from "./application/commands/unpay-installment.handler";
import { UpdateInstallmentPlanHandler } from "./application/commands/update-installment-plan.handler";
import { GetInstallmentPlanQueryHandler } from "./application/queries/get-installment-plan.handler";
import { ListInstallmentPlansQueryHandler } from "./application/queries/list-installment-plans.handler";
import { INSTALLMENT_PLAN_REPOSITORY } from "./domain/ports/installment-plan.repository.port";
import { PrismaInstallmentPlanRepository } from "./infrastructure/prisma-installment-plan.repository";
import { InstallmentsController } from "./presentation/installments.controller";

const commandHandlers = [
  CreateInstallmentPlanHandler,
  UpdateInstallmentPlanHandler,
  PayInstallmentHandler,
  UnpayInstallmentHandler,
  RemoveInstallmentPlanHandler,
];

const queryHandlers = [ListInstallmentPlansQueryHandler, GetInstallmentPlanQueryHandler];

@Module({
  imports: [
    CqrsModule,
    JwtModule.register({}),
    InstallmentPaymentDataModule,
    // A plan with interest commits more debt than the price: the difference is
    // charged to the card's credit pool (see the handler).
    CardAccountDataModule,
    TransactionDataModule,
  ],
  controllers: [InstallmentsController],
  providers: [
    ...commandHandlers,
    ...queryHandlers,
    { provide: INSTALLMENT_PLAN_REPOSITORY, useClass: PrismaInstallmentPlanRepository },
    JwtAuthGuard,
  ],
  exports: [],
})
export class InstallmentPlanModule {}
