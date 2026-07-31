import { z } from "zod";

export const investmentIdParamsSchema = z.object({ id: z.string().min(1) });
export type InvestmentIdParams = z.infer<typeof investmentIdParamsSchema>;
