import { Module } from "@nestjs/common";

import { INSTALLMENT_PAYMENT_REPOSITORY } from "./domain/ports/installment-payment.repository.port";
import { PrismaInstallmentPaymentRepository } from "./infrastructure/prisma-installment-payment.repository";

/** Leaf data module for the `installment-payment` table. */
@Module({
  providers: [{ provide: INSTALLMENT_PAYMENT_REPOSITORY, useClass: PrismaInstallmentPaymentRepository }],
  exports: [INSTALLMENT_PAYMENT_REPOSITORY],
})
export class InstallmentPaymentDataModule {}
