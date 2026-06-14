import createMiddleware from "next-intl/middleware";
import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { getLocaleFromPathname } from "@/lib/i18n/pathname";
import { routing } from "@/lib/i18n/routing";

const intlMiddleware = createMiddleware(routing);

export default auth((req) => {
  const intlResponse = intlMiddleware(req);

  if (intlResponse.status !== 200) {
    return intlResponse;
  }

  const pathname = req.nextUrl.pathname;
  const parsed = getLocaleFromPathname(pathname, routing.locales);

  if (!parsed) {
    return intlResponse;
  }

  const { locale, pathnameWithoutLocale } = parsed;
  const isPublic =
    pathnameWithoutLocale === "/login" || pathnameWithoutLocale === "/register";

  if (isPublic) {
    return intlResponse;
  }

  if (!req.auth) {
    return NextResponse.redirect(new URL(`/${locale}/login`, req.nextUrl));
  }

  return intlResponse;
});

export const config = {
  matcher: ["/((?!api|_next|_vercel|.*\\..*).*)"],
};
