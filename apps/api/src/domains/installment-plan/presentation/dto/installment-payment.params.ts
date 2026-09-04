import { z } from "zod";

import { rowId } from "@finance/contracts";

/** `:id/payments/:seq/(pay|unpay)` path params — `seq` arrives as a string
 * from the URL, coerced to the positive integer sequence it identifies. */
export const installmentPaymentParamsSchema = z.object({
  id: rowId,
  seq: z.coerce.number().int().positive(),
});
export type InstallmentPaymentParams = z.infer<typeof installmentPaymentParamsSchema>;
