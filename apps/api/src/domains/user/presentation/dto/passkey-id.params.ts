import { z } from "zod";

import { rowId } from "@finance/contracts";

export const passkeyIdParamsSchema = z.object({ id: rowId });
export type PasskeyIdParams = z.infer<typeof passkeyIdParamsSchema>;
