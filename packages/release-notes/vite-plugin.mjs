// Novedades: gives the build the versions (scripts/versions.mjs) as the module
// `virtual:fik-release-versions`, read once per build from git. Used by apps/web, apps/landing and
// this package's tests.

import { resolveVersions } from "./scripts/versions.mjs";

const ID = "virtual:fik-release-versions";
const RESOLVED = `\0${ID}`;

/** @returns {import("vite").Plugin} */
export function releaseVersions() {
  /** @type {string | null} */
  let code = null;
  return {
    name: "fik-release-versions",
    resolveId(id) {
      return id === ID ? RESOLVED : null;
    },
    load(id) {
      if (id !== RESOLVED) return null;
      code ??= `export default ${JSON.stringify(resolveVersions())};`;
      return code;
    },
  };
}
