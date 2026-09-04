import { z } from "zod";

import { rowId } from "@finance/contracts";

export const savingsEntryIdParamsSchema = z.object({ id: rowId });
export type SavingsEntryIdParams = z.infer<typeof savingsEntryIdParamsSchema>;
