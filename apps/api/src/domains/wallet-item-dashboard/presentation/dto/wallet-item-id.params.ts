import { z } from "zod";

import { rowId } from "@finance/contracts";

export const walletItemIdParamsSchema = z.object({ id: rowId });
export type WalletItemIdParams = z.infer<typeof walletItemIdParamsSchema>;
