# Tasks: Migrar geolocalización de sesiones a IPinfo con caché

**Input**: Design documents from `specs/026-ipinfo-geolocation/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/README.md

**Tests**: incluidos, misma convención de siempre en este repo.

**Organization**: US1 (resolver país sin archivo local) es la que trae toda la infraestructura nueva
(tabla, dominio, `GeoIpLookup` reescrito, cron). US2 (ciudad nunca para sesiones nuevas) es una
CONSECUENCIA directa de US1 — no agrega código propio, solo pruebas que lo confirman. US3
(atribución) es un cambio de frontend completamente disjunto.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: archivo distinto de otras tareas `[P]` de su misma fase.
- **[Story]**: `US1`, `US2`, `US3`, o `POLISH`.

---

## Phase 1: Setup

- [x] T001 Agregar `model IpGeolocationCache` a `apps/api/prisma/schema.prisma` (ver
      data-model.md) y correr `pnpm --filter @finance/api exec prisma generate` +
      `pnpm db:push`.

---

## Phase 2: User Story 1 - País sin archivo local (Priority: P1)

**Goal**: con `IPINFO_TOKEN` configurado, un login desde una IP nueva resuelve país vía IPinfo; una
IP ya vista no genera una llamada de red nueva; sin ninguna fuente configurada, el login no se
rompe.

**Independent Test**: ver quickstart.md Escenarios 1-4.

### Dominio nuevo `ip-geolocation-cache`

- [x] T002 [P] [US1] Crear `apps/api/src/domains/ip-geolocation-cache/domain/
ip-geolocation-cache.entity.ts` (`IP_GEOLOCATION_CACHE_TTL_DAYS`, `IpGeolocationCacheEntry`,
      `planCacheEntry`). Depende de T001.
- [x] T003 [P] [US1] Crear `apps/api/src/domains/ip-geolocation-cache/domain/ports/
ip-geolocation-cache.repository.port.ts` (`findFreshByIp`, `upsert`, `deleteExpired`).
- [x] T004 [US1] Implementar `PrismaIpGeolocationCacheRepository` en
      `apps/api/src/domains/ip-geolocation-cache/infrastructure/
prisma-ip-geolocation-cache.repository.ts`. Depende de T002, T003.
- [x] T005 [US1] Crear `ip-geolocation-cache.data.module.ts` (leaf). Depende de T004.
- [x] T006 [P] [US1] Crear `application/commands/purge-expired-cache.command.ts` (mirror de
      `PurgeExpiredRecordsCommand`, `scope: "system"`).
- [x] T007 [US1] Crear `application/commands/purge-expired-cache.handler.ts` (mirror de
      `PurgeExpiredRecordsHandler`). Depende de T003, T006.
- [x] T008 [US1] Crear `ip-geolocation-cache.module.ts` (orquestación: registra el handler,
      importa/exporta el leaf). Depende de T005, T007.

### Config + cron

- [x] T009 [P] [US1] Crear `apps/api/src/infra/config/ipinfo.config.ts` (`getIpinfoToken`, mismo
      patrón que `getGeoIpDbPath`).
- [x] T010 [US1] Crear `apps/api/src/infra/cron/ip-geolocation-cache-purge.cron.ts` (mirror de
      `IdempotencyCleanupCron`, `EVERY_DAY_AT_5AM`). Depende de T008.
- [x] T011 [US1] Registrar `IpGeolocationCacheModule`/`IpGeolocationCachePurgeCron` en
      `apps/api/src/infra/cron/cron.module.ts`. Depende de T010.

### `GeoIpLookup` reescrito

- [x] T012 [US1] Reescribir `apps/api/src/domains/user/application/geoip-lookup.ts` según
      data-model.md: inyectar `IpGeolocationCacheRepositoryPort`, extraer `resolveEffectiveIp`,
      agregar `lookupViaIpinfo`/`fetchFromIpinfo`/`lookupViaMaxMind` — `lookup(ip)` mantiene su
      firma pública exacta. Depende de T003, T009.
- [x] T013 [US1] Agregar `IpGeolocationCacheDataModule` a los `imports` de
      `apps/api/src/domains/user/user.module.ts`. Depende de T005, T012.
- [x] T014 [P] [US1] Agregar `IPINFO_TOKEN` (comentado, vacío) a `apps/api/.env.example`, junto al
      comentario existente de `GEOIP_DB_PATH` (nota: IPinfo es la fuente preferida si ambos están
      configurados).

### Tests for User Story 1

- [x] T015 [P] [US1] Reescribir/ampliar
      `apps/api/test/unit/domains/user/application/geoip-lookup.spec.ts`: con un fake del puerto de
      caché — hit de caché no llama `fetch`; miss llama `fetch` y cachea el resultado 2xx; un fallo
      (network error / non-2xx) devuelve sin país y NO cachea nada; sin token cae al camino MaxMind
      existente sin cambios; sin ninguna fuente configurada devuelve `NO_LOCATION`. Depende de T012.
- [x] T016 [P] [US1] Crear
      `apps/api/test/integration/domains/ip-geolocation-cache/infrastructure/
prisma-ip-geolocation-cache.repository.integration.spec.ts` contra Postgres real:
      `upsert` + `findFreshByIp` redondo; un registro con `expiresAt` pasado no se devuelve;
      `deleteExpired` borra solo lo vencido. Depende de T004.
- [x] T017 [P] [US1] Crear
      `apps/api/test/unit/domains/ip-geolocation-cache/application/commands/
purge-expired-cache.handler.spec.ts` (mirror del test de `PurgeExpiredRecordsHandler`). Depende de
      T007.

**Checkpoint**: US1 funcional e independiente — país resuelto por IPinfo con caché, verificable con
quickstart.md Escenarios 1-4.

---

## Phase 3: User Story 2 - Ciudad nunca para sesiones nuevas (Priority: P2)

**Goal**: confirmar que el camino nuevo nunca resuelve ciudad, y que una sesión antigua con ciudad
no se ve afectada.

**Independent Test**: quickstart.md Escenario 6.

- [x] T018 [P] [US2] Agregar un caso a `geoip-lookup.spec.ts` (T015): el resultado de
      `lookupViaIpinfo`, tanto en hit de caché como en miss, siempre trae `city: null` — sin
      excepción. Depende de T015.
- [x] T019 [P] [US2] Ampliar la aserción ya existente en
      `test/integration/domains/user/application/list-sessions.integration.spec.ts` (que ya
      sembraba una sesión con `city: "Santiago"`) para verificar explícitamente que ese dato
      histórico se lee sin cambios — en vez de un archivo nuevo, ya que el escenario coincidía
      con un test pre-existente.

**Checkpoint**: US2 confirmado — no requiere código nuevo, solo prueba el comportamiento que US1 ya
produce por construcción.

---

## Phase 4: User Story 3 - Atribución visible (Priority: P2)

**Goal**: un enlace visible a IPinfo en Perfil → Seguridad.

**Independent Test**: quickstart.md Escenario 5.

- [x] T020 [P] [US3] Agregar la línea de atribución (ver data-model.md) a
      `apps/web/src/domains/profile/components/SecuritySection.tsx`, debajo de la lista de
      sesiones.
- [x] T021 [P] [US3] Agregar `profile.security.sessions.attribution` a
      `apps/web/src/i18n/{es,en}.json`.
- [x] T022 [US3] Agregar un caso a
      `apps/web/src/domains/profile/components/SecuritySection.test.tsx`: la sección siempre
      renderiza el enlace a IPinfo, independientemente de si alguna sesión mostrada tiene país
      resuelto. Depende de T020, T021.

**Checkpoint**: US3 funcional e independiente — no depende de US1/US2 en absoluto (es solo texto +
un enlace).

---

## Phase 5: Polish & Cross-Cutting Concerns

- [x] T023 [P] [POLISH] Correr `pnpm --filter @finance/api test:unit`, `test:integration`,
      `test:e2e` completos.
- [x] T024 [P] [POLISH] Correr `pnpm --filter @finance/web test` completo.
- [x] T025 [P] [POLISH] `pnpm typecheck`, `pnpm lint` y `pnpm check:boundaries` en ambos paquetes.
- [x] T026 [POLISH] Validar manualmente quickstart.md Escenarios 1-6 contra la API real (con el
      `IPINFO_TOKEN` real configurado en `.env` — nunca versionado).
- [x] T027 [POLISH] Actualizar `docs/PENDING.md`: cerrar el punto 4b (migración a IPinfo) con el
      mismo criterio usado para cerrar el punto 4 (specs/023/024) — reemplazar el "Para hacerlo
      real" por una nota de "Cerrado por specs/026".
- [x] T028 [POLISH] Memory sync manual de `CLAUDE.md` (nunca con el hook genérico de
      agent-context): nueva entrada "Current plan (026 — implementado)", degradar 025 a "Prior
      plan", amend al bullet de `session`/`user` sobre `GeoIpLookup` + el nuevo dominio-tabla
      `ip-geolocation-cache`, y actualizar el conteo de "25 table-domains" → "26" en la lista de
      `apps/api`.
- [x] T029 [POLISH] Sync Impact Report en `.specify/memory/constitution.md` (nueva entrada, PATCH o
      MINOR según corresponda — un dominio-tabla nuevo sin principio amendado es PATCH, mismo
      criterio que specs/023 le dio a `session`) + bump del conteo de tablas si el texto de algún
      principio lo nombra explícitamente.

---

## Dependencies & Execution Order

- **Setup (Phase 1)**: bloquea todo lo demás — la tabla debe existir antes de cualquier código que
  la use.
- **US1 (Phase 2)**: depende de Setup. Trae toda la infraestructura nueva.
- **US2 (Phase 3)**: depende de US1 (el comportamiento que prueba lo produce el código de US1) —
  pero es solo tests, cero código productivo propio.
- **US3 (Phase 4)**: sin dependencias de US1/US2 — puede hacerse en cualquier momento, incluso en
  paralelo con Setup.
- **Polish (Phase 5)**: depende de que las tres historias estén completas.

## Notes

- Commitear después de cada historia completa.
- El `IPINFO_TOKEN` real nunca se escribe en ningún archivo versionado, mensaje de commit, ni
  documentación — solo en el `.env` local (gitignoreado).
