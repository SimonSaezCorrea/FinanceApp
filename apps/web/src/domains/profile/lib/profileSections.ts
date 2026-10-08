import {
  FileCheck,
  LockKeyhole,
  type LucideIcon,
  ShieldCheck,
  SlidersHorizontal,
  UserRound,
} from "lucide-react";

/** The profile's sections (specs/029). Each one is a route under `/profile`; the summary is the
 * index. Adding a section is one entry here plus its child route — nothing else is laid out by
 * hand (FR-007). */
export type ProfileSectionKey = "summary" | "personal" | "security" | "preferences" | "privacy";

export type ProfileSectionGroup = "account" | "app" | "privacy";

export interface ProfileSection {
  key: ProfileSectionKey;
  /** Relative to `/profile`; `""` is the index. */
  path: string;
  group: ProfileSectionGroup;
  icon: LucideIcon;
}

export const PROFILE_SECTIONS: readonly ProfileSection[] = [
  { key: "summary", path: "", group: "account", icon: ShieldCheck },
  { key: "personal", path: "personal", group: "account", icon: UserRound },
  { key: "security", path: "security", group: "account", icon: LockKeyhole },
  { key: "preferences", path: "preferences", group: "app", icon: SlidersHorizontal },
  { key: "privacy", path: "privacy", group: "privacy", icon: FileCheck },
];

export const PROFILE_GROUPS: readonly ProfileSectionGroup[] = ["account", "app", "privacy"];

/** Absolute address of a section. */
export function sectionHref(section: Pick<ProfileSection, "path">): string {
  return section.path ? `/profile/${section.path}` : "/profile";
}
