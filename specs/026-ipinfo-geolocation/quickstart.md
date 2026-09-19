# Quickstart: Migrar geolocalización de sesiones a IPinfo con caché

Validación manual, contra la API real (`pnpm --filter @finance/api dev`), con `IPINFO_TOKEN`
configurado en `apps/api/.env` y **sin** `GEOIP_DB_PATH` (para probar el camino IPinfo puro).

## Escenario 1 — IP nunca antes vista resuelve país sin archivo local

1. Confirmar que no hay ningún `.mmdb` en el entorno y que `GEOIP_DB_PATH` está vacío/ausente.
2. Hacer login (`POST /auth/login`) simulando un origen distinto al loopback (en este entorno, el
   `DEV_FALLBACK_IP` de desarrollo ya cubre esto — ver `geoip-lookup.ts`).
3. `GET /auth/sessions` — la sesión recién creada debe traer `country` no nulo y `city: null`.
4. Verificar en Postgres (`select * from "ip-geolocation-cache"`) que existe una fila para esa IP con
   `expiresAt` ≈ ahora + 60 días.

## Escenario 2 — La misma IP no genera una segunda llamada de red

1. Repetir un login desde la MISMA IP que el Escenario 1 (otro usuario, o el mismo).
2. Confirmar (con un `console.log`/breakpoint temporal en `fetchFromIpinfo`, o simplemente
   verificando que la fila de caché existente no cambió su `createdAt`) que no se llamó a la API
   externa — el país viene de la fila ya guardada.

## Escenario 3 — Sin ninguna fuente configurada, el login no se rompe

1. Comentar/vaciar tanto `IPINFO_TOKEN` como `GEOIP_DB_PATH`.
2. Hacer login — debe completar exitosamente; `GET /auth/sessions` muestra esa sesión con
   `country: null`.

## Escenario 4 — Un fallo del proveedor no bloquea el login ni se cachea

1. Con `IPINFO_TOKEN` configurado a un valor inválido (ej. `IPINFO_TOKEN=badtoken`).
2. Hacer login desde una IP nueva — debe completar exitosamente, `country: null` para esa sesión.
3. Restaurar el token válido y volver a hacer login desde la MISMA IP — esta vez SÍ debe resolver
   país (prueba que el fallo anterior no dejó un registro `null` cacheado por 60 días).

## Escenario 5 — Atribución visible

1. Abrir la app, ir a Perfil → Seguridad.
2. Confirmar que bajo la lista de sesiones hay una línea visible con un enlace a IPinfo
   (`https://ipinfo.io`).

## Escenario 6 — Ciudad histórica intacta

1. Ubicar (en datos ya sembrados, previos a esta migración) una sesión con `city` no nulo.
2. Confirmar que `GET /auth/sessions` la sigue mostrando con esa ciudad exactamente igual que antes
   de esta migración — ninguna sesión antigua pierde su dato.
