import { z } from "zod";

export const cardParamsSchema = z.object({ id: z.string().min(1), cardId: z.string().min(1) });
export type CardParams = z.infer<typeof cardParamsSchema>;
