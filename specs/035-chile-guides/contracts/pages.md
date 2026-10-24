# Contract: guide pages

| Page        | es                                   | en                                        |
| ----------- | ------------------------------------ | ----------------------------------------- |
| Index       | `/es/guias/`                         | `/en/guides/`                             |
| Guide       | `/es/guias/<slug-es>/`               | `/en/guides/<slug-en>/`                   |
| First guide | `/es/guias/fecha-de-cierre-tarjeta/` | `/en/guides/credit-card-statement-dates/` |

## Every guide page (HTML, no script needed)

- `<title>` = title + " · fik"; meta description = `description`; canonical = its own path;
  `hreflang` for each language that exists (its pair), plus x-default.
- `h1` title; meta line: "Publicado el …", "Revisado el …", "Equipo fik" (`<time datetime>`).
- Table of contents: one link per `h2`, each `h2` with an `id`.
- Body; "Fuentes" list (name, title, link, `rel="noopener"`); general-information notice.
- CTA in `[data-access-slot]`: `?acceso=registro` + `<template data-app-template>` "Ir a la app".
- Link back to the index.
- JSON-LD: `Article` + `BreadcrumbList`.

## Index page

- `h1`, lead, list of the language's guides (title link, description, "Revisado el …"), newest review
  first; empty → a sentence saying there are none yet.
- JSON-LD: `CollectionPage` (+ `ItemList`) + `BreadcrumbList`.

## Links in

- Footer of every page: "Guías" / "Guides" → the index of the page's language.
- FAQ page: one link to the index.

## Build-time failures (FR-015)

Missing/invalid frontmatter field, unknown language file, repeated slug in a language, `reviewedAt`
before `publishedAt` → the build stops naming the file and the problem.
