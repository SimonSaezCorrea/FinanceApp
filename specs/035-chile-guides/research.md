# Research: Guías de finanzas personales para Chile

## R1. Dónde vive el contenido

- **Decision**: colección de contenido de Astro (`src/content.config.ts`, loader `glob` sobre
  `apps/landing/src/content/guides/**/*.md`), con esquema zod (`astro/zod`). Una carpeta por guía y un
  archivo por idioma: `src/content/guides/<key>/es.md`, `en.md`. `<key>` (p. ej. `statement-dates`)
  es la identidad que empareja los idiomas; nunca aparece en una dirección.
- **Rationale**: FR-014 (publicar = agregar texto). Astro valida el frontmatter contra el esquema al
  construir y falla con el archivo y el campo culpables (FR-015). `render(entry)` devuelve el
  contenido y la lista de encabezados, de donde sale el índice de secciones (FR-005). Ya hay
  precedente de Markdown en el sitio (`src/legal/privacy-policy.*.md`).
- **Alternatives**: Markdown importado a mano por página (como la política de privacidad): no escala a
  N guías ni valida datos. MDX: permite componentes dentro del texto, pero no hace falta y agrega una
  dependencia.

## R2. Formato de una guía (frontmatter)

```yaml
title: "Fecha de cierre y fecha de pago de la tarjeta de crédito" # h1 y <title>
description: "…" # meta description y resumen del índice (≤ 160 caracteres)
slug: "fecha-de-cierre-tarjeta" # dirección en el idioma de la página
publishedAt: 2026-10-23
reviewedAt: 2026-10-23
sources:
  - { name: "CMF", title: "¿Qué muestra el estado de cuenta…?", url: "https://…" }
```

`lang` sale del nombre del archivo (`es.md` / `en.md`); el autor es fijo ("Equipo fik") hasta la tarea
de autor con nombre. Validación del esquema: textos no vacíos, `description` ≤ 160, `slug` en
minúsculas con guiones (`^[a-z0-9]+(-[a-z0-9]+)*$`), fechas válidas, `sources` con al menos una entrada
y `url` https.

## R3. Validaciones que el esquema no puede hacer

- **Decision**: función pura `validateGuides(entries)` en `domains/guides/lib/guides.ts`, llamada por
  las páginas al construir: rechaza dos guías con la misma dirección en un idioma, `reviewedAt <
publishedAt` y un archivo de idioma desconocido. Lanza un error que nombra el archivo; el build se
  detiene (FR-015). Probada con Vitest.
- `loadGuides(lang)` = `getCollection` + `validateGuides` + orden por `reviewedAt` descendente (FR-012)
  - el par del otro idioma (misma `<key>`), o `null` si no existe (borde: guía en un solo idioma).

## R4. Direcciones

- **Decision**: índice `/es/guias/` y `/en/guides/`; guía `/es/guias/<slug>/` y `/en/guides/<slug>/`.
  `guides` entra a la tabla de slugs por idioma, la misma excepción de las páginas de UF y dólar.
  Para que el merge con la rama del simulador (034) sea trivial, se hace aquí el MISMO cambio que
  hizo esa rama: `RATE_SLUGS` → `LOCALIZED_SLUGS` (+ `LocalizedPage`, `isLocalizedPage`), y en
  astro.config `RATE_PAIRS` → `LOCALIZED_PAIRS`.
- Rutas: `src/pages/[lang]/[guides]/index.astro` (índice) y `src/pages/[lang]/[guides]/[slug].astro`
  (guía). El segmento `[guides]` solo genera `guias` (es) y `guides` (en).

## R5. Metadatos, par de idioma y sitemap

- `PageLayout` hoy arma canonical/hreflang con `pagePath(lang, page)`. Gana un prop opcional `paths`
  (`Partial<Record<Language, string>>`): con él, canonical = `paths[lang]` y un `hreflang` solo por
  idioma presente (borde: guía en un idioma, sin alternativa rota). Las demás páginas no cambian.
- Sitemap: `@astrojs/sitemap` empareja por segmento de idioma, lo que no sirve con slugs distintos.
  `astro.config.mjs` lee al arrancar el frontmatter `slug` de `src/content/guides/*/{es,en}.md`
  (lectura de archivos + una expresión regular sobre la línea `slug:`, sin dependencia nueva) y agrega
  esos pares, más el del índice, a `LOCALIZED_PAIRS`. Un test de build verifica los pares.

## R6. Datos estructurados

- Guía: `Article` (headline, description, inLanguage, datePublished, dateModified, `author`
  Organization "Equipo fik", `publisher` Organization fik con logo, mainEntityOfPage) +
  `BreadcrumbList` (fik › Guías › guía).
- Índice: `CollectionPage` con `ItemList` de las guías + `BreadcrumbList`.

## R7. Presentación

- Plantilla Astro sin JavaScript propio (FR-010): título (`HERO_TITLE`), resumen, línea de meta
  (Publicado · Revisado · Equipo fik), índice de secciones (de los `h2`), cuerpo con el mismo estilo de
  texto que la política de privacidad (se extrae a una clase compartida `prose-fik`), fuentes como
  lista con enlaces, aviso de información general, bloque "Cómo lo haces en fik" (es una sección del
  propio Markdown, convención `## Cómo lo haces en fik` / `## How to do it in fik`) y CTA.
- CTA: `<a href="?acceso=registro" data-access="registro">` dentro de `[data-access-slot]` con su
  `<template data-app-template>` "Ir a la app" (mecanismo existente de `scripts/session.ts`, cargado en
  todas las páginas por `PageLayout`).
- Fechas con `Intl.DateTimeFormat` del idioma (`es-CL`, `en-US`), como `chileDay.formatDay`.
- Textos de la interfaz (no el contenido) en `landing.guides.*` de ambos catálogos (Principio III).

## R8. Fuentes oficiales para la primera guía

- CMF, "¿Qué muestra el Estado de Cuenta de la Tarjeta de Crédito?":
  https://www.cmfchile.cl/portal/principal/623/w4-article-27872.html — documento mensual con las
  operaciones del período de facturación, fecha de vencimiento y monto mínimo de pago.
- SERNAC, ficha del D.S. N° 44 de 2012 (MINECON), reglamento sobre información al consumidor de
  tarjetas de crédito: https://www.sernac.cl/portal/618/w3-article-11629.html — crea el estado de cuenta.
- Diario Oficial, 6-08-2026, nuevo reglamento de información al consumidor de tarjetas de crédito
  (D.S. N° 75 de 2025), que deja sin efecto el D.S. 44 desde el 6-02-2028:
  https://www.diariooficial.interior.gob.cl/publicaciones/2026/08/06/44518/01/2846533.pdf — la guía
  dice que el reglamento vigente es el D.S. 44 y que hay uno nuevo publicado que rige desde 2028.
- CMF, NCG N° 537 (fórmula del pago mínimo, aplicada desde junio de 2026):
  https://cmfchile.cl/portal/prensa/615/articles-95105_doc_pdf.pdf — solo para mencionar que el pago
  mínimo lo define el emisor con una fórmula regulada, sin calcularlo.
- Contenido de dominio: `docs/spanish/BANKING_LOGIC.md` §3.6 y el amendment de "statements generated
  with the bank's dates" de CLAUDE.md (en fik la persona genera cada facturación con las fechas de su
  estado de cuenta).
- Cada fuente se verifica (abre y dice lo citado) al escribir la guía; la fecha de revisión es ese día.

## R9. Pruebas

- Unit (Vitest, jsdom no hace falta): `validateGuides` (direcciones repetidas, fechas invertidas,
  idioma desconocido), emparejamiento, orden; lector de pares del sitemap.
- Build (`test/build.test.ts`): índice y guía en ambos idiomas con title/description únicos, canonical,
  hreflang al par, `Article`/`CollectionPage` + `BreadcrumbList`, fuentes con enlace, fechas, autor,
  aviso, índice de secciones con anclas, CTA con slot, sin `<script src>` propio, pie con enlace a
  Guías en todas las páginas, Preguntas con enlace, sitemap con los pares.
- Lighthouse móvil local de índice y guía (SC-002).
