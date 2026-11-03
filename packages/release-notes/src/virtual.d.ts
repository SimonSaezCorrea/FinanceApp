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
  }[];
  export default versions;
}
