import { z } from "zod";

/** Money crosses the boundary as a decimal STRING (never a JS number). */
export const moneyString = z
  .string()
  .regex(/^-?\d+(\.\d+)?$/, "must be a decimal string");
