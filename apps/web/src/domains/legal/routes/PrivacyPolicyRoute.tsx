import { ExternalLink } from "lucide-react";
import { marked } from "marked";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";

// The same text the public site publishes (`mifik.cl/<lang>/privacy-policy/`): one source in
// @finance/i18n, so the two can never disagree. Spanish is the version that applies.
import policyEn from "@finance/i18n/legal/privacy-policy.en.md?raw";
import policyEs from "@finance/i18n/legal/privacy-policy.es.md?raw";

import { landingPrivacyPolicyUrl } from "../../../shared/lib/landingUrl";
import { PageHeader } from "../../../shared/ui/page-header";

/**
 * The legal privacy policy inside the app, so reading it never means leaving for the public site.
 * The Markdown is ours (never user input), so its HTML is rendered as is.
 */
export function PrivacyPolicyRoute() {
  const { t, i18n } = useTranslation();
  const english = i18n.language.startsWith("en");
  const html = useMemo(
    () => marked.parse(english ? policyEn : policyEs, { async: false }),
    [english],
  );

  return (
    <div className="mx-auto flex max-w-[46rem] flex-col gap-6 pb-10">
      <PageHeader
        title={t("legal.privacyPolicy.title")}
        actions={
          <a
            href={landingPrivacyPolicyUrl(i18n.language)}
            target="_blank"
            rel="noopener"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
          >
            {t("legal.privacyPolicy.onSite")}
            <ExternalLink className="h-3.5 w-3.5" aria-hidden />
          </a>
        }
      />
      <article
        className="prose-fik flex flex-col gap-4"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}
