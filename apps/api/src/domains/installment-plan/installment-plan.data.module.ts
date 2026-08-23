import { Module } from "@nestjs/common";

import { InstallmentPaymentDataModule } from "../installment-payment/installment-payment.data.module";
import { INSTALLMENT_PLAN_REPOSITORY } from "./domain/ports/installment-plan.repository.port";
import { PrismaInstallmentPlanRepository } from "./infrastructure/prisma-installment-plan.repository";

/**
 * Leaf data module for the `installment-plan` table: the aggregate's port→adapter
 * binding plus the child-table leaf its adapter composes (`installment-payment`,
 * which holds the schedule rows).
 *
 * Split out of `InstallmentPlanModule` (the orchestration side) so `credit-statement`
 * can reach the plan repository — closing a billing period must stamp the instalments
 * it charges — without importing this domain's controller and handlers. Importing the
 * orchestration module instead would put orchestration inside orchestration and make
 * the graph cyclic, which is exactly what Constitution VI's leaf rule prevents.
 */
@Module({
  imports: [InstallmentPaymentDataModule],
  providers: [{ provide: INSTALLMENT_PLAN_REPOSITORY, useClass: PrismaInstallmentPlanRepository }],
  exports: [INSTALLMENT_PLAN_REPOSITORY],
})
export class InstallmentPlanDataModule {}
