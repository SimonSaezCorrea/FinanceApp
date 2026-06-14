import { routing } from "@/lib/i18n/routing";

type RoutingLocale = (typeof routing.locales)[number];

export function getLocaleFromPathname(
  pathname: string,
  locales: readonly RoutingLocale[],
): { locale: RoutingLocale; pathnameWithoutLocale: string } | null {
  for (const locale of locales) {
    if (pathname === `/${locale}`) {
      return { locale, pathnameWithoutLocale: "/" };
    }
    const prefix = `/${locale}/`;
    if (pathname.startsWith(prefix)) {
      return {
        locale,
        pathnameWithoutLocale: `/${pathname.slice(prefix.length)}`,
      };
    }
  }
  return null;
}
