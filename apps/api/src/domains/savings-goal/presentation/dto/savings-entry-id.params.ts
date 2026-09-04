import { z } from "zod";

export const savingsEntryIdParamsSchema = z.object({ id: z.string().min(1) });
export type SavingsEntryIdParams = z.infer<typeof savingsEntryIdParamsSchema>;
