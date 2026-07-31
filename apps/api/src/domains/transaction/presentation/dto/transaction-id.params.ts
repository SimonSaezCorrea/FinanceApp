import { z } from "zod";

export const transactionIdParamsSchema = z.object({ id: z.string().min(1) });
export type TransactionIdParams = z.infer<typeof transactionIdParamsSchema>;
