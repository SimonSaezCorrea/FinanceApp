import { z } from "zod";

export const savingsGoalIdParamsSchema = z.object({ id: z.string().min(1) });
export type SavingsGoalIdParams = z.infer<typeof savingsGoalIdParamsSchema>;
