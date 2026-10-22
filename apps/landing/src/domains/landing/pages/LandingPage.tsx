import { I18nRoot } from "../../../i18n";
import type { Language, LocalizedPage, Page } from "../../../lib/language";
import { HomeRates, type HomeRatesProps } from "../../rates/components/HomeRates";
import { HomeSimulator, type HomeSimulatorProps } from "../../simulator/components/HomeSimulator";
import { AboutPage } from "./AboutPage";
import { FaqPage } from "./FaqPage";
import { HomePage } from "./HomePage";
import { PricingPage } from "./PricingPage";
import { PrivacyPage } from "./PrivacyPage";

/** The pages written in React. The privacy policy is Markdown rendered by its own Astro page, and
 * the indicator pages (spec 033) and the installment simulator (spec 034) are Astro pages with
 * plain scripts. */
type ReactPage = Exclude<Page, "privacyPolicy" | LocalizedPage>;

const CONTENT: Record<ReactPage, () => React.JSX.Element> = {
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
export function LandingPage({
  lang,
  page,
  homeRates,
  homeSimulator,
}: Readonly<{
  lang: Language;
  page: ReactPage;
  homeRates?: HomeRatesProps;
  homeSimulator?: HomeSimulatorProps;
}>) {
  const Content = CONTENT[page];
  return (
    <I18nRoot lang={lang}>
      {page === "home" ? (
        <HomePage
          rates={homeRates ? <HomeRates {...homeRates} /> : null}
          simulator={homeSimulator ? <HomeSimulator {...homeSimulator} /> : null}
        />
      ) : (
        <Content />
      )}
    </I18nRoot>
  );
}
