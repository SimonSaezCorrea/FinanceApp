import { I18nRoot } from "../../../i18n";
import type { Language, Page } from "../../../lib/language";
import { AboutPage } from "./AboutPage";
import { FaqPage } from "./FaqPage";
import { HomePage } from "./HomePage";
import { PricingPage } from "./PricingPage";
import { PrivacyPage } from "./PrivacyPage";

const CONTENT: Record<Page, () => React.JSX.Element> = {
  home: HomePage,
  about: AboutPage,
  privacy: PrivacyPage,
  pricing: PricingPage,
  faq: FaqPage,
};

/**
 * One public page's content with its translations, as ONE React tree: Astro renders the children
 * of a framework component separately, so wrapping `<I18nRoot>` around a page in `.astro` would
 * leave the page outside the provider. Rendered at build time only — never hydrated.
 */
export function LandingPage({ lang, page }: Readonly<{ lang: Language; page: Page }>) {
  const Content = CONTENT[page];
  return (
    <I18nRoot lang={lang}>
      <Content />
    </I18nRoot>
  );
}
