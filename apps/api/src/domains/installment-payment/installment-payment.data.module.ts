import { Module } from "@nestjs/common";

import { INSTALLMENT_PAYMENT_LOOKUP } from "./domain/ports/installment-payment-lookup.port";
import { INSTALLMENT_PAYMENT_REPOSITORY } from "./domain/ports/installment-payment.repository.port";
import { PrismaInstallmentPaymentRepository } from "./infrastructure/prisma-installment-payment.repository";

/** Leaf data module for the `installment-payment` table. Exports two ports over the
 * same adapter: the full repository for its own aggregate, and a read-only lookup for
 * `transaction`, which must ask whether a movement backs an instalment before letting
 * it be edited (FR-028a) and has no business writing here. */
@Module({
  providers: [
    { provide: INSTALLMENT_PAYMENT_REPOSITORY, useClass: PrismaInstallmentPaymentRepository },
    { provide: INSTALLMENT_PAYMENT_LOOKUP, useClass: PrismaInstallmentPaymentRepository },
  ],
  exports: [INSTALLMENT_PAYMENT_REPOSITORY, INSTALLMENT_PAYMENT_LOOKUP],
})
export class InstallmentPaymentDataModule {}
