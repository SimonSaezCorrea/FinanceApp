import { z } from "zod";

import { rowId } from "@finance/contracts";

export const accountIdParamsSchema = z.object({ id: rowId });
export type AccountIdParams = z.infer<typeof accountIdParamsSchema>;
