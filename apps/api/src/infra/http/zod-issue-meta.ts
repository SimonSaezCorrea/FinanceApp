import type { ZodType } from "zod";

/**
 * Walks a zod schema down to the sub-schema that failed at `path` (a
 * safeParse issue's own `path`), unwrapping optional/nullable/default
 * wrappers and array elements along the way, and returns whatever that node's
 * `.meta()` carries. Used by `ZodValidationPipe`/`ZodParamsPipe` to map a
 * failing field's own tagged meta (e.g. `rowId`'s `{ errorCode:
 * "INVALID_ID_FORMAT" }`) to a specific error code, instead of the pipes'
 * generic fallback — without hard-coding field names or issue shapes.
 */
export function metaAtPath(
  schema: ZodType,
  path: ReadonlyArray<PropertyKey>,
): Record<string, unknown> | undefined {
  let node: unknown = schema;
  for (const key of path) {
    node = unwrap(node);
    const shape = (node as { shape?: Record<PropertyKey, unknown> })?.shape;
    if (typeof key === "number" || (typeof key === "string" && /^\d+$/.test(key))) {
      const element = (node as { def?: { element?: unknown } })?.def?.element;
      if (!element) return undefined;
      node = element;
      continue;
    }
    if (!shape || !(key in shape)) return undefined;
    node = shape[key];
  }
  node = unwrap(node);
  const meta = (node as { meta?: () => Record<string, unknown> })?.meta;
  return typeof meta === "function" ? meta.call(node) : undefined;
}

function unwrap(node: unknown): unknown {
  let current = node;
  for (;;) {
    const type = (current as { def?: { type?: string; innerType?: unknown } })?.def?.type;
    if (type === "optional" || type === "nullable" || type === "default") {
      current = (current as { def: { innerType: unknown } }).def.innerType;
      continue;
    }
    return current;
  }
}
