// Types for version-rules.mjs, for packages that type-check without allowJs (apps/web).
export declare const FIRST_VERSION: string;
export declare function parseVersion(value: string | null | undefined): [number, number] | null;
export declare function compareVersions(
  a: string | null | undefined,
  b: string | null | undefined,
): number;
export declare function nextVersion(last: string | null | undefined): string;
export declare function versionSlug(version: string): string;
export declare function chileDay(date?: Date): string;
