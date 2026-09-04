import { z } from "zod";

import { rowId } from "@finance/contracts";

export const transactionIdParamsSchema = z.object({ id: rowId });
export type TransactionIdParams = z.infer<typeof transactionIdParamsSchema>;
