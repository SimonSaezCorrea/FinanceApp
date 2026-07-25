import { z } from "zod";

export const accountIdParamsSchema = z.object({ id: z.string().min(1) });
export type AccountIdParams = z.infer<typeof accountIdParamsSchema>;
