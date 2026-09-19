# Data Model: Migrar geolocalización de sesiones a IPinfo con caché

## Schema (Prisma)

```prisma
/// Caché IP → país, global (sin FK a User — una misma IP consultada por dos usuarios distintos
/// comparte el mismo registro, ver Key Entity de specs/026). Solo existe mientras `IPINFO_TOKEN`
/// está configurado; con MaxMind local (o sin nada) esta tabla simplemente no se usa.
model IpGeolocationCache {
  id      String  @id @default(uuid(7))
  /// La clave de negocio real — NUNCA el PK (Principio VIII). Una IPv4 o IPv6 tal cual la ve el
  /// server (`req.ip`), nunca un bloque/CIDR.
  ip      String  @unique
  /// ISO alpha-2 (ej. "CL"), mismo formato que `Session.country` ya usa hoy vía MaxMind. `null`
  /// significa "IPinfo respondió 2xx pero sin country_code" — un resultado genuino, cacheado igual
  /// (a diferencia de un error de red/timeout/4xx/5xx, que nunca llega a escribirse aquí).
  country String?

  createdAt DateTime @default(now())
  /// createdAt + IP_GEOLOCATION_CACHE_TTL_DAYS (60). Barrido por el cron diario; una lectura
  /// también filtra por esta columna directamente, así que un registro vencido-pero-no-barrido-
  /// todavía nunca se sirve como si fuera fresco (mismo cuidado que `Session.closedAt` ya tiene).
  expiresAt DateTime

  @@index([expiresAt])
  @@map("ip-geolocation-cache")
}
```

Sin migración de datos: entorno de desarrollo únicamente, `db push` crea la tabla.

## Domain (`apps/api/src/domains/ip-geolocation-cache/`)

### `domain/ip-geolocation-cache.entity.ts`

```ts
export const IP_GEOLOCATION_CACHE_TTL_DAYS = 60;

export interface IpGeolocationCacheEntry {
  ip: string;
  country: string | null;
  expiresAt: Date;
}

/** La fila a escribir tras una respuesta 2xx genuina de IPinfo — nunca se llama tras un fallo de
 * red/timeout/status no-2xx (research.md R4). */
export function planCacheEntry(ip: string, country: string | null, now: Date): IpGeolocationCacheEntry {
  return {
    ip,
    country,
    expiresAt: new Date(now.getTime() + IP_GEOLOCATION_CACHE_TTL_DAYS * 24 * 60 * 60 * 1000),
  };
}
```

### `domain/ports/ip-geolocation-cache.repository.port.ts`

```ts
import type { IpGeolocationCacheEntry } from "../ip-geolocation-cache.entity";

export const IP_GEOLOCATION_CACHE_REPOSITORY = Symbol("IP_GEOLOCATION_CACHE_REPOSITORY");

/** Adapter (Principio VI) — el ÚNICO puerto que puede tocar la tabla `ip-geolocation-cache`. */
export interface IpGeolocationCacheRepositoryPort {
  /** `null` en un miss O en un registro cuyo `expiresAt` ya pasó — ambos casos tratados
   * idénticamente por `GeoIpLookup`: se resuelve como si nunca se hubiera cacheado. El filtro por
   * `expiresAt` va DENTRO de la consulta — no depende de que el cron ya haya pasado. */
  findFreshByIp(ip: string, now: Date): Promise<IpGeolocationCacheEntry | null>;

  /** Upsert keyeado por la columna única `ip` — atómico a nivel de Postgres, así que dos logins
   * concurrentes desde la misma IP nueva no colisionan (research.md R6). */
  upsert(entry: IpGeolocationCacheEntry): Promise<void>;

  /** Barrido del cron diario. Devuelve cuántas filas se eliminaron. */
  deleteExpired(now: Date): Promise<number>;
}
```

### `infrastructure/prisma-ip-geolocation-cache.repository.ts`

```ts
import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../infra/prisma/prisma.service";
import type { IpGeolocationCacheEntry } from "../domain/ip-geolocation-cache.entity";
import type { IpGeolocationCacheRepositoryPort } from "../domain/ports/ip-geolocation-cache.repository.port";

@Injectable()
export class PrismaIpGeolocationCacheRepository implements IpGeolocationCacheRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  async findFreshByIp(ip: string, now: Date): Promise<IpGeolocationCacheEntry | null> {
    const row = await this.prisma.ipGeolocationCache.findFirst({
      where: { ip, expiresAt: { gt: now } },
    });
    return row ? { ip: row.ip, country: row.country, expiresAt: row.expiresAt } : null;
  }

  async upsert(entry: IpGeolocationCacheEntry): Promise<void> {
    await this.prisma.ipGeolocationCache.upsert({
      where: { ip: entry.ip },
      create: { ip: entry.ip, country: entry.country, expiresAt: entry.expiresAt },
      update: { country: entry.country, expiresAt: entry.expiresAt },
    });
  }

  async deleteExpired(now: Date): Promise<number> {
    const result = await this.prisma.ipGeolocationCache.deleteMany({
      where: { expiresAt: { lt: now } },
    });
    return result.count;
  }
}
```

### `ip-geolocation-cache.data.module.ts` (leaf)

```ts
import { Module } from "@nestjs/common";

import { IP_GEOLOCATION_CACHE_REPOSITORY } from "./domain/ports/ip-geolocation-cache.repository.port";
import { PrismaIpGeolocationCacheRepository } from "./infrastructure/prisma-ip-geolocation-cache.repository";

/** Leaf data module — importa ningún otro dominio, así que `user` puede depender de este sin
 * crear un ciclo (Principio VI). */
@Module({
  providers: [
    { provide: IP_GEOLOCATION_CACHE_REPOSITORY, useClass: PrismaIpGeolocationCacheRepository },
  ],
  exports: [IP_GEOLOCATION_CACHE_REPOSITORY],
})
export class IpGeolocationCacheDataModule {}
```

### `application/commands/purge-expired-cache.command.ts` + `.handler.ts`

Mismo shape exacto que `PurgeExpiredRecordsCommand`/`Handler` de `idempotency-record`
(`scope: "system"`, `BaseCommandHandler<Command, number, null>`, `loadContext` → `null`, `handle`
llama `repo.deleteExpired(command.now)`).

### `ip-geolocation-cache.module.ts` (orquestación)

```ts
import { Module } from "@nestjs/common";
import { CqrsModule } from "@nestjs/cqrs";

import { PurgeExpiredCacheHandler } from "./application/commands/purge-expired-cache.handler";
import { IpGeolocationCacheDataModule } from "./ip-geolocation-cache.data.module";

/** Sin controller — el mecanismo es invisible por HTTP, igual que `idempotency-record`. */
@Module({
  imports: [CqrsModule, IpGeolocationCacheDataModule],
  providers: [PurgeExpiredCacheHandler],
  exports: [IpGeolocationCacheDataModule],
})
export class IpGeolocationCacheModule {}
```

## Config reader: `infra/config/ipinfo.config.ts`

```ts
import { ConfigService } from "@nestjs/config";

/** Opcional, mismo trato "inerte sin configurar" que `getGeoIpDbPath` — `null` significa que
 * `GeoIpLookup` cae a MaxMind (si está configurado) o a ningún país. NUNCA `getOrThrow`. */
export function getIpinfoToken(config: ConfigService): string | null {
  const value = config.get<string>("IPINFO_TOKEN");
  return value && value.trim().length > 0 ? value : null;
}
```

## Reescritura de `GeoIpLookup` (`user/application/geoip-lookup.ts`)

Estructura del archivo tras el cambio (el reader de MaxMind y `resolveEffectiveIp` — el swap de dev
loopback→IP pública — se conservan tal cual, solo se extrae `effectiveIp` una vez y se comparte entre
los dos caminos):

```ts
@Injectable()
export class GeoIpLookup {
  private readerPromise: Promise<Reader<CityResponse> | null> | undefined;

  constructor(
    private readonly config: ConfigService,
    @Inject(IP_GEOLOCATION_CACHE_REPOSITORY)
    private readonly cache: IpGeolocationCacheRepositoryPort,
  ) {}

  async lookup(ip: string | undefined): Promise<GeoLocation> {
    if (!ip) return NO_LOCATION;
    const effectiveIp = this.resolveEffectiveIp(ip);
    const token = getIpinfoToken(this.config);
    return token
      ? this.lookupViaIpinfo(effectiveIp, token)
      : this.lookupViaMaxMind(effectiveIp);
  }

  private resolveEffectiveIp(ip: string): string {
    return LOOPBACK_IPS.has(ip) && this.config.get<string>("NODE_ENV") !== "production"
      ? DEV_FALLBACK_IP
      : ip;
  }

  private async lookupViaIpinfo(ip: string, token: string): Promise<GeoLocation> {
    const now = new Date();
    const cached = await this.cache.findFreshByIp(ip, now);
    if (cached) return { country: cached.country, city: null };

    const result = await this.fetchFromIpinfo(ip, token);
    if (!result.ok) return NO_LOCATION; // fallo transitorio — nunca cacheado (research.md R4)

    await this.cache.upsert(planCacheEntry(ip, result.country, now));
    return { country: result.country, city: null };
  }

  private async fetchFromIpinfo(
    ip: string,
    token: string,
  ): Promise<{ ok: true; country: string | null } | { ok: false }> {
    try {
      const res = await fetch(
        `https://api.ipinfo.io/lite/${encodeURIComponent(ip)}?token=${token}`,
        { signal: AbortSignal.timeout(3000) },
      );
      if (!res.ok) return { ok: false };
      const body = (await res.json()) as { country_code?: string };
      return { ok: true, country: body.country_code ?? null };
    } catch {
      return { ok: false };
    }
  }

  // --- camino MaxMind, sin cambios de comportamiento ---
  private load(): Promise<Reader<CityResponse> | null> { /* idéntico a hoy */ }
  private async lookupViaMaxMind(ip: string): Promise<GeoLocation> { /* cuerpo actual de `lookup`, sin la resolución de effectiveIp (ya hecha arriba) */ }
}
```

`GeoLocation`/`NO_LOCATION`/`LOOPBACK_IPS`/`DEV_FALLBACK_IP` se mantienen sin cambios. El token nunca
se loguea ni se incluye en ningún mensaje de error.

## Módulo `user` (`user.module.ts`)

Agrega `IpGeolocationCacheDataModule` a `imports` — `GeoIpLookup` ya está en `providers` (sin cambio,
sigue siendo una clase inyectada directamente, no detrás de un token) y Nest resuelve
`IP_GEOLOCATION_CACHE_REPOSITORY` automáticamente porque el módulo importado lo exporta.

## Cron (`infra/cron/ip-geolocation-cache-purge.cron.ts`)

Mismo shape que `IdempotencyCleanupCron`, `@Cron(CronExpression.EVERY_DAY_AT_5AM)`, dispara
`PurgeExpiredCacheCommand`. Registrado en `cron.module.ts` (import de `IpGeolocationCacheModule` +
el cron en `providers`).

## `.env.example`

```
# IP geolocation (specs/026). Optional, inert without a token — country falls back to
# GEOIP_DB_PATH (below) if set, or resolves to no country at all. Free/unlimited "Lite" tier at
# https://ipinfo.io/signup — country + ASN only, no city. Its data is CC BY-SA 4.0: the app shows
# a visible attribution in Profile → Security (SecuritySection.tsx) as the license requires.
IPINFO_TOKEN=
```

`GEOIP_DB_PATH`'s existing comment gets a one-line addendum noting IPinfo is now the preferred
source when both are set (no functional change to the MaxMind path itself).

## Frontend: atribución (`SecuritySection.tsx`)

Inmediatamente debajo del `<div className="overflow-hidden rounded-lg border">` que contiene la
lista de sesiones (dentro del mismo `<div className="pt-3">`), una línea siempre visible:

```tsx
<p className="mt-2 text-[11px] text-muted-foreground">
  {t("profile.security.sessions.attribution")}{" "}
  <a
    href="https://ipinfo.io"
    target="_blank"
    rel="noreferrer"
    className="underline"
  >
    IPinfo
  </a>
</p>
```

i18n (`profile.security.sessions.attribution`): es `"Datos de ubicación por"`, en `"Location data
by"`.
