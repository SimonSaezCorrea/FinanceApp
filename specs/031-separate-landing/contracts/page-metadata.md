# Contract: metadatos de página e indexación (031)

## Cada página pública (`/{lang}/{slug}`)

```html
<html lang="{lang}" data-theme="…">            <!-- pre-pintado de tema antes del primer paint -->
<title>{landing.meta.<page>.title}</title>
<meta name="description" content="{landing.meta.<page>.description}">
<link rel="canonical" href="{SITE}/{lang}/{slug}">
<link rel="alternate" hreflang="es" href="{SITE}/es/{slug}">
<link rel="alternate" hreflang="en" href="{SITE}/en/{slug}">
<link rel="alternate" hreflang="x-default" href="{SITE}/">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Cuadra">
<meta property="og:title" content="{title}">
<meta property="og:description" content="{description}">
<meta property="og:url" content="{SITE}/{lang}/{slug}">
<meta property="og:image" content="{SITE}/og/cuadra-{lang}.png">   <!-- 1200×630 -->
<meta property="og:locale" content="{es_CL | en_US}">
<meta name="twitter:card" content="summary_large_image">
<meta name="theme-color" content="…">
```

- `page ∈ {home, about, privacy, pricing, faq}`; claves en el catálogo de la landing, es/en.
- Títulos únicos entre las 10 páginas; formato `"{sección} · Cuadra"` salvo la portada
  (`"Cuadra · {eslogan}"`).
- El contenido principal (`<h1>` y el texto de la página) está en el HTML entregado.
- Ninguna página referencia chunks de `apps/web`.

## Mapa del sitio y robots

- `/sitemap-index.xml` (`@astrojs/sitemap`), con las 10 páginas y sus alternativas por idioma;
  excluye la raíz y las redirecciones.
- `/robots.txt`: `User-agent: *` / `Allow: /` / `Sitemap: {SITE}/sitemap-index.xml`.

## App

- `apps/web/index.html`: `<meta name="robots" content="noindex, nofollow">`; sin `og:*`.
- Sin `robots.txt` con `Disallow` (Google no podría leer el `noindex`).
