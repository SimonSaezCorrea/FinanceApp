import { locate } from "./parse";

/** The record ids behind a set of file paths, newest first (ids start with the date). */
export function idsOf(paths: readonly string[]): string[] {
  return [...new Set(paths.map((p) => locate(p).id))].sort().reverse();
}
