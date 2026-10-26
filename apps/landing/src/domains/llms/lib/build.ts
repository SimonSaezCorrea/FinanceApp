import { sortForIndex } from "../../guides/lib/guides";
import { loadGuides } from "../../guides/lib/load";
import { t } from "../../../i18n";
import { APP_URL } from "../../../lib/config";
import { buildRatesSnapshot } from "../../../lib/exchangeRates";
import { type Language, LANGUAGES, type Page, pagePath } from "../../../lib/language";
import { metaDescription, metaTitle } from "../../../lib/market";
import { type LlmsSection, llmsText } from "./llmsText";

/** The pages listed per language, in reading order (the email-link pages and the 404 are not). */
const LISTED: readonly Page[] = [
  "home",
  "ufValue",
  "dollarRate",
  "guides",
  "about",
  "pricing",
  "faq",
  "privacy",
  "privacyPolicy",
];
const SECTION_HEADING: Record<Language, string> = {
  es: "Pages in Spanish",
  en: "Pages in English",
};

/** The site's `llms.txt`, built from the pages' own metadata, the guides and today's rates (build
 * time only). Shared by `/llms.txt` and the page that shows it to people (`/<lang>/ai/`). */
export async function buildLlmsText(site: URL | undefined): Promise<string> {
  const origin = (site?.toString() ?? "http://localhost:4321/").replace(/\/+$/, "");
  const [{ guides }, snapshot] = await Promise.all([loadGuides(), buildRatesSnapshot()]);

  const sections: LlmsSection[] = LANGUAGES.flatMap((lang) => [
    {
      heading: SECTION_HEADING[lang],
      links: LISTED.map((page) => ({
        title: metaTitle(lang, page).replace(/ · fik$/, ""),
        url: `${origin}${pagePath(lang, page)}`,
        description: metaDescription(lang, page),
      })),
    },
    {
      heading: `${t(lang, "landing.guides.nav")} (${lang})`,
      links: sortForIndex(guides, lang).map((guide) => ({
        title: guide.title,
        url: `${origin}${guide.path}`,
        description: guide.description,
      })),
    },
  ]);

  const rates = (
    [
      ["CLF", "UF", "ufValue"],
      ["USD", "US dollar (dólar observado)", "dollarRate"],
    ] as const
  ).flatMap(([currency, name, page]) => {
    const rate = snapshot?.latest[currency];
    return rate
      ? [
          {
            name,
            value: rate.value,
            valueDate: rate.valueDate,
            url: `${origin}${pagePath("en", page)}`,
          },
        ]
      : [];
  });

  return llmsText({ appUrl: APP_URL, sections, rates });
}
