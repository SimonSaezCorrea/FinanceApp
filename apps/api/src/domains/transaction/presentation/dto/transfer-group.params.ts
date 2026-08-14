import { z } from "zod";

export const transferGroupParamsSchema = z.object({ groupId: z.string().min(1) });
export type TransferGroupParams = z.infer<typeof transferGroupParamsSchema>;
