export declare function buildEnv(appRoot: string): Record<string, string | undefined>;
export declare function inlineScriptHashes(html: string): Set<string>;
export declare function originOf(url: string | undefined | null): string | null;
export declare function serializePolicy(
  directives: Record<string, (string | null | undefined)[]>,
): string;
export declare function writeCsp(
  distDir: string,
  directives: Record<string, (string | null | undefined)[]>,
): { policy: string; hashes: number };
