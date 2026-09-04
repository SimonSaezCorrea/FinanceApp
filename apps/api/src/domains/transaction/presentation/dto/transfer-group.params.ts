import { z } from "zod";

import { rowId } from "@finance/contracts";

export const transferGroupParamsSchema = z.object({ groupId: rowId });
export type TransferGroupParams = z.infer<typeof transferGroupParamsSchema>;
