import { ArrowRight, CreditCard, KeyRound, type LucideIcon, Plus, Receipt } from "lucide-react";
import { useTranslation } from "react-i18next";

import { cn } from "@finance/ui/src/shared/lib/cn";
import { useLang } from "../../../i18n";
import { type Page, pagePath } from "../../../lib/language";
import { HERO_TITLE } from "../components/bits";
import { AccessLink } from "../components/AccessLink";

const P = "landing.faq";

/** Groups → question keys; each question lives at `landing.faq.items.<key>.{q,a}`. A group whose
 * answers summarize another page ends with a link to it. */
const GROUPS: {
  key: string;
  icon: LucideIcon;
  items: string[];
  link?: { page: Page; label: string };
}[] = [
  { key: "howItWorks", icon: Receipt, items: ["bankSync", "setup", "conversion", "investments"] },
  {
    key: "cardsBilling",
    icon: CreditCard,
    items: ["creditBalance", "closing", "partialPayment", "additionalCard", "interest"],
  },
  {
    key: "yourData",
    icon: KeyRound,
    items: ["signIn", "deleteAccount", "minors"],
    link: { page: "privacy", label: `${P}.morePrivacy` },
  },
];

/** Every question has its own anchor (`/preguntas#faq-minors`), so one answer can be shared. */
const questionId = (item: string) => `faq-${item}`;

/**
 * "Preguntas frecuentes" (canvas "Cuadra · Preguntas frecuentes", option F1): from `lg`, a sticky
 * column with the title, a topic index and the sign-up card, beside the questions grouped by topic.
 * Below `lg` everything stacks and the sign-up card moves after the questions.
 */
export function FaqPage() {
  return (
    <>
      <Faq />
    </>
  );
}

function Faq() {
  const { t } = useTranslation();
  const lang = useLang();

  return (
    <div className="grid gap-8 pb-16 pt-8 sm:pb-20 sm:pt-10 lg:grid-cols-[22rem_minmax(0,1fr)] lg:items-start lg:gap-20 lg:pb-28 lg:pt-16">
      {/* Below `lg` the aside dissolves (`contents`) so its topic row becomes a child of the page
          grid and can stick under the header for the whole list of questions; inside the aside
          it would unstick as soon as the title scrolled away. */}
      <aside className="contents lg:sticky lg:top-24 lg:flex lg:flex-col lg:gap-9">
        <div className="flex flex-col gap-4">
          <h1 id="landing-faq-title" tabIndex={-1} className={HERO_TITLE}>
            {t(`${P}.titleLead`)} <span className="text-primary">{t(`${P}.titleAccent`)}</span>
          </h1>
          <p className="text-base leading-relaxed text-muted-foreground">{t(`${P}.subtitle`)}</p>
        </div>

        {/* Phone and tablet: a sticky row of chips that scrolls sideways. Desktop: the column. */}
        <nav
          aria-label={t(`${P}.topics`)}
          className="sticky top-[var(--landing-header,4.5rem)] z-30 -mx-4 flex snap-x gap-2 overflow-x-auto border-y bg-background/90 px-4 py-2.5 backdrop-blur [scrollbar-width:none] lg:static lg:mx-0 lg:flex-col lg:gap-1 lg:overflow-visible lg:border-0 lg:bg-transparent lg:p-0 lg:backdrop-blur-none"
        >
          {GROUPS.map(({ key, icon, items }) => (
            <a
              key={key}
              href={`#faq-${key}`}
              className="grid min-h-11 shrink-0 snap-start grid-cols-[auto_auto_auto] items-center gap-2 rounded-full border bg-card py-1 pl-1 pr-3.5 text-sm font-medium transition-colors hover:border-border hover:bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:grid-cols-[2.75rem_minmax(0,1fr)_auto] lg:gap-3.5 lg:rounded-2xl lg:border-transparent lg:bg-transparent lg:p-3 lg:text-[15px]"
            >
              <TopicIcon icon={icon} />
              {t(`${P}.groups.${key}`)}
              <span className="font-mono text-[13px] text-muted-foreground">{items.length}</span>
            </a>
          ))}
        </nav>

        <SignUpCard className="hidden lg:flex" />
      </aside>

      <div className="flex flex-col gap-16">
        {GROUPS.map(({ key, icon, items, link }) => (
          <section
            key={key}
            id={`faq-${key}`}
            aria-labelledby={`faq-${key}-title`}
            // Below `lg` the header AND the sticky topic row cover the top of the screen.
            className="reveal flex scroll-mt-[calc(var(--landing-header,4.5rem)+4.5rem)] flex-col gap-2 lg:scroll-mt-24"
          >
            <div className="mb-3 flex items-center gap-4">
              <TopicIcon icon={icon} large />
              <h2
                id={`faq-${key}-title`}
                className="text-2xl font-bold tracking-tight sm:text-[1.875rem]"
              >
                {t(`${P}.groups.${key}`)}
              </h2>
            </div>
            <div className="border-b">
              {items.map((item) => (
                <details
                  key={item}
                  id={questionId(item)}
                  className="group scroll-mt-[calc(var(--landing-header,4.5rem)+4.5rem)] border-t lg:scroll-mt-24"
                >
                  <summary className="grid cursor-pointer list-none grid-cols-[minmax(0,1fr)_2rem] items-center gap-4 px-1 py-5 text-base font-semibold leading-snug focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:text-lg [&::-webkit-details-marker]:hidden">
                    {t(`${P}.items.${item}.q`)}
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-chip text-[hsl(var(--ridge-line))] transition-[transform,background-color,color] duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] group-open:rotate-45 group-open:bg-[hsl(var(--ridge-line))] group-open:text-background motion-reduce:transition-none">
                      <Plus className="h-4 w-4" strokeWidth={2.5} aria-hidden />
                    </span>
                  </summary>
                  <p className="max-w-[68ch] px-1 pb-6 pr-2 text-[15px] leading-relaxed text-muted-foreground sm:pr-14 sm:text-base">
                    {t(`${P}.items.${item}.a`)}
                  </p>
                </details>
              ))}
            </div>
            {link ? (
              <a
                href={pagePath(lang, link.page)}
                className="mt-3 inline-flex items-center gap-1.5 self-start px-1 text-[15px] font-medium text-primary transition-colors hover:text-primary/80"
              >
                {t(link.label)}
                <ArrowRight className="h-4 w-4" aria-hidden />
              </a>
            ) : null}
          </section>
        ))}

        <SignUpCard className="flex lg:hidden" />
      </div>
    </div>
  );
}

function TopicIcon({ icon: Icon, large }: Readonly<{ icon: LucideIcon; large?: boolean }>) {
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center bg-chip text-[hsl(var(--ridge-line))]",
        // The small one sits in a chip below `lg`, so it's round and chip-sized there.
        large
          ? "h-12 w-12 rounded-2xl sm:h-14 sm:w-14"
          : "h-8 w-8 rounded-full lg:h-11 lg:w-11 lg:rounded-xl",
      )}
    >
      <Icon
        className={large ? "h-6 w-6 sm:h-[26px] sm:w-[26px]" : "h-4 w-4 lg:h-[22px] lg:w-[22px]"}
        aria-hidden
      />
    </span>
  );
}

function SignUpCard({ className }: Readonly<{ className?: string }>) {
  const { t } = useTranslation();
  return (
    <div className={cn("flex-col gap-3 rounded-2xl border bg-card p-6", className)}>
      <p className="text-[17px] font-semibold">{t(`${P}.cta.title`)}</p>
      <p className="text-sm leading-relaxed text-muted-foreground">{t(`${P}.cta.body`)}</p>
      <AccessLink mode="registro" size="lg" className="mt-1.5">
        {t("auth.createAccount")}
      </AccessLink>
    </div>
  );
}
