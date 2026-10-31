# Research: Novedades (038)

## R1 — Fuente única de los registros

- **Decision**: paquete fuente `@finance/release-notes` con los Markdown y su parser; el sitio usa
  `import.meta.glob` ansioso al construir, la app un glob perezoso.
- **Rationale**: ambos son Vite; la app no depende del sitio en tiempo de ejecución (sin CORS, sin
  dominio cruzado, funciona en desarrollo); un solo parser = el mismo contenido en ambos lados.
- **Alternatives**: colección de contenido de Astro en `apps/landing` (la app no puede importarla:
  `web ↛ landing`); la app pidiendo un JSON al sitio (CORS, latencia, otro punto de falla); enlazar desde
  la app a la página pública (el punto necesita conocer el último id igual).

## R2 — Formato del archivo

- **Decision**: carpeta `<YYYY-MM-DD>-<slug>` = id (la fecha sale del nombre, no se repite);
  frontmatter mínimo (`title`, `summary` opcional, `commits` solo en `es.md`); cuerpo: encabezados `##` de
  un tipo conocido por idioma y viñetas `- `, con continuación indentada; inline: `**negrita**`, `` `código` ``,
  `[texto](https://…)` (solo https). Parser propio del subconjunto YAML usado (sin dependencia nueva).
- **Rationale**: escribible a mano sin herramientas; errores claros nombrando el archivo.
- **Alternatives**: todo en frontmatter (incómodo de escribir); `js-yaml` (dependencia nueva por 4 claves).

## R3 — Garantía de cobertura

- **Decision**: el registro lista hashes (≥ 7 caracteres, prefijo del completo). `check.mjs` lee
  `git log --no-merges --format=%H%x1f%s <rango>`, se queda con asuntos `^(feat|fix)(\([^)]*\))?!?:` y
  falla si alguno no empieza con un hash cubierto, listando `hash corto  asunto`. `--pending` imprime los
  faltantes listos para pegar como `commits:` sin fallar.
- **Rationale**: el flujo publica con avance rápido `dev → main` y los merges a `dev` conservan los
  hashes; los hashes son exactos (un rango de git se rompe con commits que llegan después).
- **Alternatives**: rango por registro (`from..to`) — frágil si llegan merges intermedios; contar
  registros por despliegue — no garantiza que cada cambio esté cubierto.

## R4 — Dónde corre

- **Decision**: `.husky/pre-push` cuando un ref va a `main`: rango `origin/main..<sha>`. CI: job
  `release-notes` en `ci.yml`, solo en push a `main`, sin depender de `gate` (el `gate` salta los demás
  jobs cuando el commit ya pasó en dev, pero este debe correr siempre), `fetch-depth: 0`, rango
  `before..sha`; con `before` en ceros o inexistente, aviso y éxito. Deploy solo corre si CI termina en
  éxito, así que un fallo bloquea la publicación.
- **Rationale**: el hook da el error antes de empujar; CI cubre el `--no-verify`.
- **Alternatives**: en `deploy.yml` (ya depende de CI; duplicaría lógica).

## R5 — "Visto"

- **Decision**: `User.releaseNotesSeenId TEXT NULL`; `POST /auth/me/release-notes/seen {releaseId}`
  204, solo avanza (comparación de strings: los ids empiezan con la fecha ISO). La app muestra el punto si
  el id más reciente es mayor que el visto (o no hay visto). Abrir `/whats-new` marca el más reciente.
- **Rationale**: mismo patrón que `onboardingClosedAt`; cross-device.
- **Alternatives**: timestamp (`releaseNotesSeenAt`) — comparar instantes con fechas de día es ambiguo;
  localStorage — no es cross-device.

## R6 — Ubicación en la app

- **Decision**: ruta `/whats-new`; acceso "Novedades" (ícono `Sparkles`) en el pie de la barra lateral
  sobre el perfil, en el riel (con `RailTip`) y como mosaico de la hoja "Más" del teléfono; el punto
  ámbar (`AttentionDot`) en el ícono y en "Más".
- **Rationale**: no es una sección de dinero ni un ajuste; junto al perfil se lee como algo "de la app".

## R7 — Despliegue

- **Decision**: cambios bajo `packages/` ya despliegan web y landing (`deploy.yml`); el API por su
  migración. El contrato marca `releaseNotesSeenId` opcional y la app ignora un fallo al marcar visto.
