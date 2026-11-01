import { useTranslation } from "react-i18next";

import type { InlineToken, Release } from "@finance/release-notes/src/parse";
import { withBrand } from "@finance/ui/src/shared/lib/brand";

function Change({ tokens }: Readonly<{ tokens: readonly InlineToken[] }>) {
  return (
    <>
      {tokens.map((token, i) => {
        switch (token.type) {
          case "text":
            return <span key={i}>{withBrand(token.text)}</span>;
          case "strong":
            return <strong key={i}>{withBrand(token.text)}</strong>;
          case "code":
            return (
              <code key={i} className="rounded bg-muted px-1 text-[0.9em]">
                {token.text}
              </code>
            );
          case "link":
            return (
              <a
                key={i}
                href={token.href}
                target="_blank"
                rel="noreferrer"
                className="text-primary underline"
              >
                {withBrand(token.text)}
              </a>
            );
        }
      })}
    </>
  );
}

/** One deploy's record: date, title, summary and its changes grouped by kind. */
export function ReleaseItem({ release }: Readonly<{ release: Release }>) {
  const { t, i18n } = useTranslation();
  const date = new Intl.DateTimeFormat(i18n.language === "en" ? "en-US" : "es-CL", {
    timeZone: "UTC",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(`${release.date}T00:00:00Z`));

  return (
    <article
      id={release.id}
      aria-labelledby={`${release.id}-title`}
      className="flex flex-col gap-4 rounded-2xl border bg-card p-5"
    >
      <header className="flex flex-col gap-1">
        <time dateTime={release.date} className="text-sm text-muted-foreground">
          {date}
        </time>
        <h2 id={`${release.id}-title`} className="text-lg font-semibold tracking-tight">
          {withBrand(release.title)}
        </h2>
        {release.summary ? (
          <p className="text-sm leading-relaxed text-muted-foreground">
            {withBrand(release.summary)}
          </p>
        ) : null}
      </header>
      {release.groups.map((group) => (
        <section key={group.kind} className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold">{t(`releaseNotes.kinds.${group.kind}`)}</h3>
          <ul className="flex list-disc flex-col gap-1.5 pl-5 text-sm leading-relaxed">
            {group.items.map((item, i) => (
              <li key={i}>
                <Change tokens={item} />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </article>
  );
}
