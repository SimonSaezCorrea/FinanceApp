import { z } from "zod";

export const debtIdParamsSchema = z.object({ id: z.string().min(1) });
export type DebtIdParams = z.infer<typeof debtIdParamsSchema>;
