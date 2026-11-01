# Data Model: Novedades (038)

## Release (archivo, no tabla)

| Campo     | Origen                 | Regla                                                                                                                                         |
| --------- | ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`      | nombre de carpeta      | `^\d{4}-\d{2}-\d{2}-[a-z0-9]+(-[a-z0-9]+)*$`, fecha válida                                                                                    |
| `date`    | prefijo del id         | `YYYY-MM-DD`                                                                                                                                  |
| `lang`    | nombre del archivo     | `es` \| `en`; las dos versiones obligatorias                                                                                                  |
| `title`   | frontmatter            | 1–80 caracteres                                                                                                                               |
| `summary` | frontmatter            | opcional, ≤ 200                                                                                                                               |
| `commits` | frontmatter de `es.md` | ≥ 1 hash hex de 7–40, únicos; `en.md` no lo lleva                                                                                             |
| `groups`  | cuerpo                 | `{ kind, items[] }`, kinds en orden fijo `new, improved, fixed, changed, security`, cada uno a lo sumo una vez, ≥ 1 grupo, ≥ 1 ítem por grupo |
| `items[]` | viñetas                | tokens inline `text`/`strong`/`code`/`link(https)`                                                                                            |

Encabezados por idioma: es `Nuevo, Mejoras, Correcciones, Cambios, Seguridad`; en `New, Improvements,
Fixes, Changes, Security`.

## User (columna nueva)

| Campo                | Tipo        | Regla                                           |
| -------------------- | ----------- | ----------------------------------------------- |
| `releaseNotesSeenId` | `TEXT NULL` | id del registro más reciente visto; solo avanza |

Transición: `null → id`, `id_a → id_b` si `id_b > id_a`; en otro caso sin cambio.
