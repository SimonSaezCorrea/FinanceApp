import { z } from "zod";

import { rowId } from "@finance/contracts";

export const cardParamsSchema = z.object({ id: rowId, cardId: rowId });
export type CardParams = z.infer<typeof cardParamsSchema>;
