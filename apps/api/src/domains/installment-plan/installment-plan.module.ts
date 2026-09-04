import { Module } from "@nestjs/common";
import { CqrsModule } from "@nestjs/cqrs";
import { JwtModule } from "@nestjs/jwt";

import { JwtAuthGuard } from "../../infra/auth/jwt-auth.guard";
import { BankAccountDataModule } from "../bank-account/bank-account.data.module";
import { CardAccountDataModule } from "../card-account/card-account.data.module";
import { IdempotencyRecordDataModule } from "../idempotency-record/idempotency-record.data.module";
import { InstallmentPaymentDataModule } from "../installment-payment/installment-payment.data.module";
import { TransactionDataModule } from "../transaction/transaction.data.module";
import { CreateInstallmentPlanHandler } from "./application/commands/create-installment-plan.handler";
import { PayInstallmentHandler } from "./application/commands/pay-installment.handler";
import { RemoveInstallmentPlanHandler } from "./application/commands/remove-installment-plan.handler";
import { UnpayInstallmentHandler } from "./application/commands/unpay-installment.handler";
import { UpdateInstallmentPlanHandler } from "./application/commands/update-installment-plan.handler";
import { GetInstallmentPlanQueryHandler } from "./application/queries/get-installment-plan.handler";
import { ListInstallmentPlansQueryHandler } from "./application/queries/list-installment-plans.handler";
import { InstallmentPlanDataModule } from "./installment-plan.data.module";
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
    // The plan's own table binding, plus the schedule rows its adapter composes.
    InstallmentPlanDataModule,
    // Handlers here also write instalment rows directly inside a caller-owned
    // transaction, so the leaf is imported on its own too.
    InstallmentPaymentDataModule,
    // A plan with interest commits more debt than the price: the difference is
    // charged to the card's credit pool (see the handler).
    CardAccountDataModule,
    TransactionDataModule,
    // Paying an instalment records a real expense AND moves the paying account's
    // balance, both inside one transaction (FR-018/FR-019a).
    BankAccountDataModule,
    IdempotencyRecordDataModule,
  ],
  controllers: [InstallmentsController],
  providers: [...commandHandlers, ...queryHandlers, JwtAuthGuard],
  exports: [],
})
export class InstallmentPlanModule {}
