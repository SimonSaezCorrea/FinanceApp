/** The versions of the records, resolved from git at build time (vite-plugin.mjs). */
declare module "virtual:fik-release-versions" {
  const versions: {
    /** `1.2` */
    version: string;
    /** `YYYY-MM-DD`, the deploy's day in Chile. */
    date: string;
    /** Not tagged yet: the version this build is about to publish. */
    pending: boolean;
    /** Record ids (folder names), newest first. */
    records: string[];
    /** What the version brought as a whole (releases/versions.json), or null without one. */
    title?: { es: string; en: string } | null;
  }[];
  export default versions;
}
