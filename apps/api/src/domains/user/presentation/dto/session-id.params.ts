import { z } from "zod";

import { rowId } from "@finance/contracts";

export const sessionIdParamsSchema = z.object({ id: rowId });
export type SessionIdParams = z.infer<typeof sessionIdParamsSchema>;
