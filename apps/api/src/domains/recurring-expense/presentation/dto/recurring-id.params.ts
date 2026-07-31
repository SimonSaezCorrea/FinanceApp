import { z } from "zod";

export const recurringIdParamsSchema = z.object({ id: z.string().min(1) });
export type RecurringIdParams = z.infer<typeof recurringIdParamsSchema>;
