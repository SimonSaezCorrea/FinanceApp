import type { Language } from "../../../lib/language";

/** The page's JSON island (built by `island.ts`, which reads the catalogs at build time only). */
export interface SimulatorIsland {
  lang: Language;
  messages: Record<string, unknown>;
}

/** `tr` over the island's templates: "results.times" + {count: 6} → "6 cuotas". */
export function translator(messages: Record<string, unknown>) {
  return (key: string, params: Record<string, string | number> = {}): string => {
    let node: unknown = messages;
    for (const part of key.split(".")) node = (node as Record<string, unknown> | undefined)?.[part];
    if (typeof node !== "string") return key;
    return node.replace(/\{\{(\w+)\}\}/g, (_, name: string) => String(params[name] ?? ""));
  };
}
