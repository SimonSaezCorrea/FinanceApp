import { useTranslation } from "react-i18next";

/** What the profile doesn't do yet, said once and as text only (specs/029 FR-021): no switch or
 * button that looks like it works. */
export function ComingSoonNote() {
  const { t } = useTranslation();
  return <p className="pl-3.5 text-xs leading-relaxed text-dim">{t("profile.comingSoon.list")}</p>;
}
