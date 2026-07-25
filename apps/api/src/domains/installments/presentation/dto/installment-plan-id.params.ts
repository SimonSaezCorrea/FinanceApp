import { z } from "zod";

export const installmentPlanIdParamsSchema = z.object({ id: z.string().min(1) });
export type InstallmentPlanIdParams = z.infer<typeof installmentPlanIdParamsSchema>;
