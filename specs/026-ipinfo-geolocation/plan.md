# Implementation Plan: Migrar geolocalización de sesiones a IPinfo con caché

**Branch**: `claude/pending-items-review-blf6wz` (spec dir `026-ipinfo-geolocation`, sin branch git
propia — se sigue trabajando en la rama designada de esta sesión) | **Date**: 2026-09-19 | **Spec**:
[spec.md](./spec.md)

**Input**: Feature specification from `specs/026-ipinfo-geolocation/spec.md`

## Summary

`GeoIpLookup` (hoy: abre un `.mmdb` de MaxMind local vía `GEOIP_DB_PATH`, sin red) gana un segundo
camino, preferido cuando está configurado: **IPinfo Lite** (`https://api.ipinfo.io/lite/{ip}`,
gratis/ilimitado, solo país+ASN, licencia CC BY-SA 4.0 con atribución obligatoria). Nuevo dominio-tabla
`ip-geolocation-cache` (mismo tratamiento mínimo que `idempotency-record`: `domain/`+`infrastructure/`
sin `presentation/`, más un `application/` acotado a un único comando de purga) — una tabla global
(sin `userId`, la clave es la IP exacta) que `GeoIpLookup` consulta ANTES de llamar a IPinfo y en la
que escribe el resultado de cada llamada exitosa, con un TTL fijo de 60 días. La interfaz pública
`GeoIpLookup.lookup(ip): Promise<GeoLocation>` no cambia — `SessionIssuer` no se entera del swap
interno. `city` queda siempre `null` para toda sesión resuelta por este camino (IPinfo Lite no lo
entrega); las sesiones ya guardadas con ciudad (MaxMind, antes de esta migración) no se tocan.
Prioridad de fuente: `IPINFO_TOKEN` configurado → IPinfo (+ caché) es la ÚNICA fuente activa esa
llamada; sin él, cae a MaxMind si `GEOIP_DB_PATH` sigue configurado; sin ninguno, sin país — igual que
hoy. Un fallo de red/timeout/status no-2xx de IPinfo nunca se cachea (para no "envenenar" una IP por
60 días ante un problema transitorio del proveedor) y nunca bloquea el login (siempre resuelve a sin
país). Atribución visible nueva en `SecuritySection.tsx` (Perfil → Seguridad, la pantalla donde el
dato de ubicación se muestra), un enlace a ipinfo.io bajo la lista de sesiones.

## Technical Context

**Language/Version**: TypeScript 5.x sobre Node 20 (backend NestJS 11) — sin cambio.

**Primary Dependencies**: ninguna nueva — la llamada a IPinfo usa el `fetch` nativo de Node 20 (este
proyecto no tiene ningún cliente HTTP hacia servicios externos hoy; confirmado por auditoría de
`package.json` de `apps/api`). `maxmind`/`ua-parser-js` (specs/023) siguen sin cambio, para el camino
de respaldo.

**Storage**: PostgreSQL vía Prisma. **Tabla nueva**: `ip-geolocation-cache` (`id` UUID v7, `ip`
único, `country` nullable, `createdAt`, `expiresAt`). Sin cambios a `Session` (ya tiene
`country`/`city` desde specs/023).

**Testing**: Vitest — `apps/api/test/{unit,integration,e2e}`; `apps/web` con Vitest + Testing
Library para el pequeño cambio de UI (atribución).

**Target Platform**: Servidor Linux (API). Primera llamada de red saliente del backend hacia un
servicio de terceros que NO es S3 (que usa su propio SDK, no `fetch` genérico).

**Project Type**: Monorepo existente — un dominio-tabla nuevo (`ip-geolocation-cache`) + una
reescritura interna de `GeoIpLookup` (`user/application/geoip-lookup.ts`) + un cron nuevo. Sin
cambios de contrato público (`packages/contracts` no gana ni pierde nada).

**Performance Goals**: la llamada a IPinfo debe tener un timeout corto (3s, `AbortSignal.timeout`)
para que una degradación del proveedor externo nunca alargue perceptiblemente un login — FR-007 es
NON-NEGOTIABLE (nunca debe impedir el login).

**Constraints**:

- El contrato público `GeoIpLookup.lookup(ip): Promise<GeoLocation>` no puede cambiar de forma
  (Assumption del spec) — `SessionIssuer` no se toca.
- La caché es global (no por usuario) — el Key Entity del spec lo dice explícito: dos usuarios
  logueándose desde la misma IP comparten el mismo registro cacheado.
- Un fallo de IPinfo (red, timeout, token inválido → 403 confirmado con una llamada real durante el
  research) nunca escribe en la caché — solo una respuesta 2xx genuina se persiste, incluso si el
  campo `country_code` viniera ausente dentro de ella.

**Scale/Scope**: 1 tabla nueva + su puerto/adapter/`*.data.module.ts`/módulo de orquestación, 1
comando+handler de purga, 1 cron nuevo (`IpGeolocationCachePurgeCron`), 1 config reader nuevo
(`getIpinfoToken`), reescritura interna de `GeoIpLookup` (mismo archivo, mismo export público), 1
línea de atribución en `SecuritySection.tsx` + 2 claves i18n, 1 env var nueva (`IPINFO_TOKEN`). Cero
endpoints HTTP nuevos, cero cambios de contrato.

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

**Data gates (always applicable — see Principles II, VII y VIII):**

- [x] Toda entidad nueva declara formato de identificador — `IpGeolocationCache.id` es **UUID v7**
      (`@default(uuid(7))`), como toda fila del schema desde specs/016. Su clave de negocio real
      (`ip`, con `@@unique`) es una columna aparte, nunca el PK — mismo patrón que el `key` de
      `IdempotencyRecord` o el `code` de `FinancialInstitution` (Principio VIII).
- [x] Todo endpoint de escritura nuevo declara idempotencia — **N/A**: esta feature no agrega ningún
      endpoint HTTP. La única escritura nueva (`upsert` de la caché) ocurre en un camino interno
      disparado por un login, nunca directamente por un request del cliente, y está protegida por el
      propio `@@unique([ip])` de Postgres (dos logins concurrentes desde una IP nueva colisionan en
      el UPSERT, no en un `create` que pueda lanzar `P2002`) — la misma garantía de "natural key +
      unique constraint" que la forma (b) del Principio VII exige, aplicada por diseño aunque no
      exista una superficie HTTP que idempotencia deba cubrir.
- [x] Toda FK aceptada desde el cuerpo de un request declara dónde se verifica su ownership —
      **N/A**: no hay FK nueva ni endpoint nuevo. La IP de la caché no es un identificador de fila de
      ningún otro dominio ni pertenece a un usuario (Key Entity del spec: "no pertenece a ningún
      usuario en particular").

## Project Structure

### Documentation (this feature)

```text
specs/026-ipinfo-geolocation/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/README.md   # documenta explícitamente "sin cambios de contrato público"
└── tasks.md               # Phase 2 (/speckit-tasks — todavía no generado)
```

### Source Code (repository root)

```text
apps/api/prisma/schema.prisma                          # + model IpGeolocationCache

apps/api/src/domains/ip-geolocation-cache/              # dominio nuevo
├── domain/
│   ├── ip-geolocation-cache.entity.ts                  # TTL const + planCacheEntry(...)
│   └── ports/ip-geolocation-cache.repository.port.ts
├── infrastructure/prisma-ip-geolocation-cache.repository.ts
├── application/commands/
│   ├── purge-expired-cache.command.ts                  # scope: "system"
│   └── purge-expired-cache.handler.ts
├── ip-geolocation-cache.data.module.ts                 # leaf — exporta el token del puerto
└── ip-geolocation-cache.module.ts                       # orquestación — registra el purge handler

apps/api/src/infra/config/ipinfo.config.ts              # getIpinfoToken(config) — inerte sin config
apps/api/src/infra/cron/ip-geolocation-cache-purge.cron.ts  # nuevo, EVERY_DAY_AT_5AM
apps/api/src/infra/cron/cron.module.ts                  # + import/provider del cron nuevo

apps/api/src/domains/user/
├── application/geoip-lookup.ts                          # reescrito por dentro (mismo export público)
└── user.module.ts                                       # + import de IpGeolocationCacheDataModule

apps/api/.env.example                                    # + IPINFO_TOKEN (comentado, inerte)

apps/api/test/
├── unit/domains/user/application/geoip-lookup.spec.ts           # reescrito/ampliado
├── integration/domains/ip-geolocation-cache/infrastructure/*.spec.ts  # nuevo
└── e2e/... (sin caso nuevo — no hay endpoint HTTP que ejercitar directamente)

apps/web/src/domains/profile/components/SecuritySection.tsx   # + línea de atribución
apps/web/src/domains/profile/components/SecuritySection.test.tsx  # + caso: atribución visible
apps/web/src/i18n/{es,en}.json                                # + profile.security.sessions.attribution
```

**Structure Decision**: un dominio-tabla nuevo, mínimo (sin `presentation/`, mismo trato que
`idempotency-record`/`mfa-recovery-code`) + una reescritura interna de un archivo ya existente. No
aplica ninguna estructura genérica "Option 1/2/3".

## Complexity Tracking

_Sin violaciones — no aplica._

## Constitution Check (post-Phase 1 re-check)

Sin cambios respecto al gate inicial — `data-model.md` confirma el `id` UUID v7 de la tabla nueva, la
ausencia de cualquier endpoint HTTP nuevo, y que el `@@unique([ip])` es lo que hace segura la
escritura concurrente sin necesitar el mecanismo de `idempotency-record`.
