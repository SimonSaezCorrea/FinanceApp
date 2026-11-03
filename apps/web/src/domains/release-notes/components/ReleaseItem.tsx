import { useTranslation } from "react-i18next";

import type { InlineToken, Release, ReleaseKind } from "@finance/release-notes/src/parse";
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

/** One color per kind, so the eye finds "Correcciones" without reading every label. */
const KIND_DOT: Record<ReleaseKind, string> = {
  new: "bg-primary",
  improved: "bg-success",
  changed: "bg-accent",
  fixed: "bg-muted-foreground",
  security: "bg-destructive",
};

/** One record of a version: title, summary and its changes, each kind in a label column beside
 * its list. The date belongs to the version (the deploy), not to the record. */
export function ReleaseItem({ release }: Readonly<{ release: Release }>) {
  const { t } = useTranslation();
  return (
    <section
      id={release.id}
      aria-labelledby={`${release.id}-title`}
      className="flex scroll-mt-6 flex-col gap-4 border-t pt-6"
    >
      <div className="flex flex-col gap-1">
        <h3 id={`${release.id}-title`} className="text-lg font-semibold tracking-tight">
          {withBrand(release.title)}
        </h3>
        {release.summary ? (
          <p className="text-sm leading-relaxed text-muted-foreground">
            {withBrand(release.summary)}
          </p>
        ) : null}
      </div>
      {release.groups.map((group) => (
        <div key={group.kind} className="grid gap-2 sm:grid-cols-[7.5rem_minmax(0,1fr)] sm:gap-5">
          <h4 className="flex items-center gap-2 self-start text-sm font-semibold sm:pt-0.5">
            <span aria-hidden className={`size-2 shrink-0 rounded-full ${KIND_DOT[group.kind]}`} />
            {t(`releaseNotes.kinds.${group.kind}`)}
          </h4>
          <ul className="flex list-disc flex-col gap-2 pl-5 text-sm leading-relaxed sm:pl-4">
            {group.items.map((item, i) => (
              <li key={i}>
                <Change tokens={item} />
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}
