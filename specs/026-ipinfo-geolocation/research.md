# Research: Migrar geolocalización de sesiones a IPinfo con caché

## R1 — Dónde vive la orquestación (caché → IPinfo → MaxMind → nada)

**Decisión**: el dominio nuevo `ip-geolocation-cache` posee ÚNICAMENTE la tabla de caché (puerto +
adapter Prisma + el comando de purga) — ningún conocimiento de IPinfo, MaxMind, ni de `Session`. La
lógica de "intenta la caché, si falta llama a IPinfo, si no hay token cae a MaxMind, si nada está
configurado no hay país" sigue viviendo enteramente en `GeoIpLookup`
(`apps/api/src/domains/user/application/geoip-lookup.ts`), que ya es el único punto que
`SessionIssuer` conoce y cuyo contrato público (`lookup(ip): Promise<GeoLocation>`) el spec exige
dejar intacto.

**Alternativas consideradas**: mover toda la lógica de geolocalización al nuevo dominio (un
`GeolocationService` allí, con `user` solo llamándolo). Descartada: `GeoIpLookup` YA es exactamente
ese seam — moverlo sería puro churn de archivos sin ganar nada, y el spec pide un "swap interno de
implementación", no una relocalización de responsabilidad. El nuevo dominio se mantiene mínimo, mismo
trato que `idempotency-record` (que tampoco sabe nada de las 10 operaciones que lo usan — solo posee
su tabla).

## R2 — Forma real de la respuesta de IPinfo Lite (verificado con una llamada real)

Con el token que el usuario proveyó (`IPINFO_TOKEN` en `apps/api/.env`, nunca versionado), se
confirmó contra la API real:

```
GET https://api.ipinfo.io/lite/8.8.8.8?token=<TOKEN>
{
  "ip": "8.8.8.8",
  "asn": "AS15169",
  "as_name": "Google LLC",
  "as_domain": "google.com",
  "country_code": "US",
  "country": "United States",
  "continent_code": "NA",
  "continent": "North America"
}
```

Un token inválido responde `403` (verificado con `token=badtoken`). **No hay campo de ciudad en
absoluto** — confirma FR-005 al nivel de la API, no solo de intención de producto.

**Decisión**: se guarda `country_code` (alpha-2, ej. `"US"`) — es exactamente el mismo formato que
`Session.country` ya tiene hoy vía MaxMind (`result.country.iso_code`, ej. `"CL"`). Esto significa
**cero cambios en el frontend más allá de la atribución**: `SecuritySection.tsx`'s `formatLocation`
ya convierte un código alpha-2 a un nombre de país localizado vía `Intl.DisplayNames` — no le importa
si ese código vino de MaxMind o de IPinfo.

## R3 — Cliente HTTP: `fetch` nativo, con timeout explícito

Confirmado por auditoría de dependencias (`apps/api/package.json`): no existe ningún cliente HTTP
hacia servicios externos en este backend hoy (S3 usa su propio SDK `@aws-sdk/client-s3`, no cuenta).
Node 20 trae `fetch`/`AbortSignal.timeout` de forma nativa — no se agrega dependencia. Se usa
`AbortSignal.timeout(3000)` (3s) en la llamada a IPinfo: FR-007 es NON-NEGOTIABLE (nunca debe
impedir el login), así que un proveedor externo lento no puede alargar un login más que unos
segundos — cualquier error (red, timeout, 4xx/5xx) se trata idénticamente: sin país para ESTA
llamada, nunca una excepción que suba hasta `SessionIssuer`.

## R4 — Un fallo de IPinfo NUNCA se cachea

**Decisión**: solo una respuesta HTTP exitosa (2xx) de IPinfo se escribe en la caché — un error de
red, un timeout, o un status no-2xx (incluido el 403 de un token inválido, verificado arriba) resulta
en "sin país para esta llamada" SIN tocar la tabla de caché.

**Por qué**: si se cacheara también el fallo, un problema transitorio del proveedor (una caída de 10
minutos, un token que se revoca y se repone) dejaría esa IP "envenenada" sin país durante los 60 días
completos del TTL, en vez de recuperarse en el próximo login real. El costo de no cachear un fallo es
mínimo (como mucho, unas pocas llamadas de red de más mientras el proveedor está caído) comparado con
el de una IP legítima quedando sin país por dos meses por una falla de la que ya se recuperó. Una
respuesta 2xx cuyo cuerpo no trajera `country_code` (caso no observado en el research, pero
teóricamente posible) SÍ se cachea con `country: null` — a diferencia de un error HTTP, ese es un
resultado genuino del proveedor, no una falla transitoria de red.

## R5 — Prioridad de fuente: nunca combinadas (ya decidido en el spec, documentado aquí por completitud)

`IPINFO_TOKEN` configurado → IPinfo (+ su caché) es la ÚNICA fuente para esa llamada — nunca se
intenta también MaxMind como respaldo dentro de la misma resolución. Sin `IPINFO_TOKEN` pero con
`GEOIP_DB_PATH` → camino MaxMind sin cambios (código existente, intacto). Sin ninguno → sin país,
como hoy. Esto es exactamente el edge case #4 del spec ("un entorno con ambos configurados a la
vez"), y evita la complejidad de "intentar IPinfo, si falla intentar MaxMind" que el spec
explícitamente no pidió.

## R6 — Clave de caché: la IP exacta, tabla global (sin `userId`)

Confirmado por el Key Entity del spec: "no pertenece a ningún usuario en particular — una misma IP
consultada por distintos usuarios comparte el mismo registro". La tabla no tiene FK a `User`. Esto
también es lo que hace segura la escritura concurrente sin ningún mecanismo de idempotencia HTTP: un
`upsert` de Prisma keyeado por la columna `@@unique(ip)` es atómico a nivel de fila en Postgres — dos
logins simultáneos desde una IP nunca antes vista, cada uno con un cache-miss, terminan escribiendo
la misma fila sin colisionar (el segundo simplemente sobreescribe con el mismo valor, o corre después
del primero; ninguno lanza una violación de unicidad como si fuera un `create`).

## R7 — TTL: 60 días (clarificado con el usuario), dónde vive la constante

El spec original solo decía "30-90 días"; clarify fijó **60 días** — punto medio del rango, sin
riesgo adicional porque el plan Lite no tiene cuota que cuidar (la única consecuencia de un TTL más
largo es que un cambio real de país de una IP tarde más en reflejarse, edge case ya aceptado en el
spec). La constante (`IP_GEOLOCATION_CACHE_TTL_DAYS = 60`) vive en
`ip-geolocation-cache/domain/ip-geolocation-cache.entity.ts` — no en `@finance/contracts`, porque a
diferencia del TTL de `idempotency-record` (que si vive en contracts, `packages/contracts/src/
idempotency`), ningún cliente/frontend necesita jamás leer este valor.

## R8 — Ubicación de la atribución: `SecuritySection.tsx`, no un footer nuevo

**Decisión**: un enlace visible a `https://ipinfo.io` justo debajo de la lista de sesiones en Perfil
→ Seguridad (`SecuritySection.tsx`), no un footer global nuevo ni una página "Acerca de".

**Por qué**: SC-005 solo exige que la atribución esté "presente y visible en el 100% de las visitas a
la pantalla donde se ubique" — no en toda la app. `SecuritySection` es exactamente la pantalla donde
el dato de ubicación resuelto por IPinfo se muestra al usuario (la lista de sesiones), así que es el
lugar más honesto y contextual: quien ve el dato ve también de dónde sale. Construir un footer global
nuevo solo para esto habría sido alcance no pedido (el spec deja la ubicación exacta como "detalle de
implementación", nunca exige que sea global). La línea se renderiza siempre que la sección está
abierta — nunca condicionada a que alguna sesión mostrada tenga país resuelto, porque es una
atribución de cumplimiento de licencia, no una nota contextual sobre un dato ausente.

## R9 — Cron: mismo patrón que `IdempotencyCleanupCron`/`SessionCleanupCron`, otro horario

**Decisión**: `IpGeolocationCachePurgeCron`, `@Cron(CronExpression.EVERY_DAY_AT_5AM)`, dispara
`PurgeExpiredCacheCommand` (`scope: "system"`, mismo shape que `PurgeExpiredRecordsCommand`).
`IdempotencyCleanupCron` corre a las 3AM, `SessionCleanupCron` a las 4AM (offset deliberado para que
no compitan, según su propio comentario) — 5AM sigue ese mismo patrón de espaciado por si en algún
entorno de desarrollo corren contra la misma base de datos pequeña al mismo tiempo.

## R10 — Confirmado: cero dependencias nuevas, cero cambio de contrato público

Auditoría de `apps/api/package.json`: ninguna librería de cliente HTTP (axios, got, node-fetch, ky,
etc.) existe hoy — `fetch` nativo es la elección natural y no agrega nada al lockfile.
`packages/contracts` no gana ningún schema ni tipo nuevo — no hay endpoint HTTP nuevo, y
`Session.country`/`Session.city` ya existían desde specs/023 sin cambiar de forma.
