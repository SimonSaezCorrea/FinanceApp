# Quickstart — validación de la feature

## Prerrequisitos

```bash
pnpm install
pnpm --filter @finance/api exec prisma generate
pnpm db:push          # aplica transferGroupId + la tabla transaction-attachment
pnpm dev              # api + web
```

Login de demo: `test@finance.local` / `demo1234`.

Para probar adjuntos hace falta un bucket compatible con S3. Sin él, la validación de adjuntos se
limita al escenario 4c (falla con mensaje claro). Con MinIO local:

```bash
docker run -p 9000:9000 -p 9001:9001 -e MINIO_ROOT_USER=minio \
  -e MINIO_ROOT_PASSWORD=minio123 minio/minio server /data --console-address ":9001"
# crear el bucket "finance-attachments" en http://localhost:9001
```

`apps/api/.env`:

```
S3_ENDPOINT=http://localhost:9000
S3_REGION=us-east-1
S3_BUCKET=finance-attachments
S3_ACCESS_KEY_ID=minio
S3_SECRET_ACCESS_KEY=minio123
S3_FORCE_PATH_STYLE=true
```

## Escenario 1 — Panel de detalle (US1)

1. Ir a **Movimientos** y hacer clic en una fila.
2. Comprobar: monto grande con signo y moneda, fecha larga · categoría · cuenta, filas de categoría,
   cuenta y saldo tras el movimiento.
3. Pulsar ‹ y › varias veces; el contador debe decir "N de M" con M = total del conjunto filtrado
   (el mismo número que muestra la vista), y al pasar el último cargado debe traer la página
   siguiente sola.
4. Abrir un movimiento sin emisor/receptor/lugar/observación: una frase, no cuatro guiones.
5. **Duplicar** → el formulario llega con los datos y la fecha de hoy; guardar crea uno nuevo y el
   original queda intacto.

## Escenario 2 — Formulario (US2)

1. **Nuevo movimiento** → escribir monto, elegir cuenta.
2. La moneda debe pasar a la de la cuenta y aparecer el **saldo proyectado**; cambiar de gasto a
   ingreso debe invertir el efecto.
3. **Guardar y crear otro** → el movimiento se crea, el panel sigue abierto y vacío, conservando
   cuenta y fecha. Repetir 3 veces sin cerrar.
4. Editar un movimiento existente: aparece el indicador de cambios sin guardar y el botón dice
   "Guardar cambios"; no hay "Guardar y crear otro".
5. Gasto en una cuenta de línea de crédito sin elegir tarjeta: no se puede guardar y se explica.

## Escenario 3 — Traspaso (US3)

1. Nuevo movimiento → segmento **Traspaso**.
2. El campo de tarjeta desaparece; el selector de destino no ofrece la cuenta de origen ni ninguna
   cuenta de línea de crédito.
3. Elegir dos cuentas de la misma moneda, monto 50.000 → guardar.
4. Verificar en **Cuentas**: origen baja 50.000, destino sube 50.000.
5. Abrir cada cuenta: cada una muestra su lado, marcado como traspaso, indicando la otra cuenta.
6. Comprobar la franja de KPI de Movimientos **antes y después** del paso 3: ingresos y gastos del
   período no cambian (SC-004); el contador de movimientos sí sube en 2.
7. Abrir cualquiera de los dos lados → editar: el formulario muestra origen, destino y ambos montos.
   Cambiar el destino por una tercera cuenta y guardar; verificar los tres saldos.
8. Con dos cuentas de distinta moneda: montos de salida y entrada independientes, sin conversión.
9. Eliminar un lado → desaparecen los dos y ambos saldos vuelven atrás.

## Escenario 4 — Adjuntos (US4)

1. Abrir un movimiento → sección **Adjuntos** → subir un JPG y un PDF de menos de 5 MB.
2. Ambos aparecen listados; abrirlos muestra el archivo original.
3. Borrar uno: desaparece de la lista y su URL deja de servir.
4. Casos de rechazo:
   - a. Archivo de 6 MB → rechazado con el motivo, nada queda a medias.
   - b. Un `.exe` renombrado a `.pdf` → rechazado (magic bytes).
   - c. Sin `S3_BUCKET` en el entorno → la sección se ve, la subida falla con mensaje claro y el
     resto del panel sigue funcionando.
5. Eliminar el movimiento → sus adjuntos dejan de ser accesibles.
6. Con la sesión de otro usuario, pedir la URL de un adjunto ajeno → 404.

## Escenario 5 — Formatos e idioma

1. Repetir escenarios 1 y 2 a 375px (ventana a pantalla completa), a 900px (panel lateral) y a
   1536px. Ninguna acción debe quedar fuera de alcance.
2. Cambiar el idioma a inglés en Perfil y recorrer ambos paneles: ninguna clave cruda.

## Puertas de calidad

```bash
pnpm check:boundaries
pnpm typecheck
pnpm --filter @finance/contracts test
pnpm --filter @finance/api test
pnpm --filter @finance/web test -- transactions
pnpm build
```

Referencias: shapes en [contracts/](./contracts/), tablas y reglas en [data-model.md](./data-model.md),
decisiones y sus alternativas en [research.md](./research.md).
