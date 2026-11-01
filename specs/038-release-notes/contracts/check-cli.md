# Check CLI contract (038)

`node packages/release-notes/scripts/check.mjs [--range <a..b>] [--pending] [--root <dir>]`

- `--range` (por defecto `origin/main..HEAD`): rango de git a revisar.
- Considera solo commits sin merge cuyo asunto es `feat` o `fix` (con o sin alcance, con o sin `!`).
- Salida 0: todos cubiertos (o ninguno que lo requiera). Salida 1: imprime cada commit faltante como
  `  <hash 8>  <asunto>` y cómo cubrirlo. Salida 2: error de uso o de git / registro ilegible.
- `--pending`: imprime los faltantes como bloque `commits:` listo para pegar y sale 0.
- `--root`: carpeta de registros (por defecto la del paquete); solo para tests.
- Scripts raíz: `pnpm release-notes:check`, `pnpm release-notes:pending`.
