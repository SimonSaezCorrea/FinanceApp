"use client";

import { useLocale } from "next-intl";
import { useEffect } from "react";

/**
 * Sets document.documentElement.lang because the root `app/layout.tsx` cannot read `[locale]` params on Next 14.
 */
export function HtmlLang() {
  const locale = useLocale();
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);
  return null;
}
