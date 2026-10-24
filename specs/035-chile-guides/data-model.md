# Data Model: Guías

No hay base de datos ni API: las guías son archivos Markdown del sitio público, validados al construir.

## Guide (un archivo `src/content/guides/<key>/<lang>.md`)

| Campo         | Tipo         | Regla                                                                                                 |
| ------------- | ------------ | ----------------------------------------------------------------------------------------------------- |
| `key`         | carpeta      | empareja los idiomas; minúsculas y guiones; nunca en la URL                                           |
| `lang`        | `es` \| `en` | nombre del archivo; otro nombre detiene el build                                                      |
| `title`       | texto        | no vacío; h1 y `<title>`                                                                              |
| `description` | texto        | no vacío, ≤ 160 caracteres; meta description y resumen del índice                                     |
| `address`     | texto        | `^[a-z0-9]+(-[a-z0-9]+)*$`; único por idioma                                                          |
| `publishedAt` | fecha        | válida                                                                                                |
| `reviewedAt`  | fecha        | válida y ≥ `publishedAt`                                                                              |
| `sources`     | lista        | ≥ 1; cada una `{ name, title, url }`, `url` https                                                     |
| cuerpo        | Markdown     | primer párrafo = la respuesta; `## …` = secciones (índice); incluye la sección "Cómo lo haces en fik" |

Derivados (nunca escritos a mano): `author` = "Equipo fik"; `path` = `/<lang>/<guias|guides>/<address>/`;
`pair` = la guía de la misma `key` en el otro idioma o `null`; `headings` (h2) para el índice de
secciones.

## GuideIndex (por idioma)

Las guías de ese idioma, ordenadas por `reviewedAt` descendente; vacío → texto "Aún no hay guías".
