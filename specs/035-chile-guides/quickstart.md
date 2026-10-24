# Quickstart: validar las guías

```bash
pnpm --filter @finance/landing test        # validateGuides, emparejamiento, orden, pares del sitemap
EXCHANGE_RATES_SNAPSHOT=test/fixtures/rates-snapshot.json pnpm --filter @finance/landing build
pnpm --filter @finance/landing test:build  # páginas, metadatos, JSON-LD, sitemap, pie y Preguntas
pnpm --filter @finance/landing typecheck   # astro check (incluye el esquema de la colección)
```

## Escenarios

1. `/es/guias/` lista la guía con resumen y "Revisado el …"; `/en/guides/` igual en inglés.
2. `/es/guias/fecha-de-cierre-tarjeta/` con JavaScript desactivado: respuesta en el primer párrafo,
   ejemplo con "tu banco", índice de secciones que salta a cada una, fuentes con enlace, fechas, "Equipo
   fik", aviso, "Cómo lo haces en fik" y CTA.
3. Cambiar de idioma lleva a `/en/guides/credit-card-statement-dates/`.
4. El pie de cualquier página y Preguntas enlazan a Guías.
5. Agregar `src/content/guides/prueba/es.md` sin `sources` → el build falla nombrando el archivo;
   con todos los datos → aparece en el índice y el sitemap sin tocar otro archivo; borrarlo.
6. Lighthouse móvil local de índice y guía: rendimiento ≥ 95, el resto 100, LCP ≤ 2 s.
7. Revisión del contenido por el dueño del producto antes de mergear (FR-017).
