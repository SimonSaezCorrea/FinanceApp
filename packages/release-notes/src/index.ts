// The public site's entry (build time). The app imports `src/lazy` instead, so the records are not
// bundled with its first screen.
export * from "./parse";
export * from "./catalog";
export { idsOf } from "./ids";
export { compareVersions, versionSlug } from "../scripts/version-rules.mjs";
