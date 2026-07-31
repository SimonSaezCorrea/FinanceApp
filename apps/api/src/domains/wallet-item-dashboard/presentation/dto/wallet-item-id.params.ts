import { z } from "zod";

export const walletItemIdParamsSchema = z.object({ id: z.string().min(1) });
export type WalletItemIdParams = z.infer<typeof walletItemIdParamsSchema>;
