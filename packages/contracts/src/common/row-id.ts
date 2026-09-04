import { z } from "zod";

/**
 * Every row identifier crosses the boundary as a UUID v7 string — never a bare
 * `z.string()`. Tagged with `errorCode` so `ZodParamsPipe`/`ZodValidationPipe`
 * can map any failure on this schema to the single shared `INVALID_ID_FORMAT`
 * code (with `field`) instead of the generic validation-failure code, without
 * the two pipes needing to special-case every id field by name.
 */
export const rowId = z.uuidv7().meta({ errorCode: "INVALID_ID_FORMAT" });
