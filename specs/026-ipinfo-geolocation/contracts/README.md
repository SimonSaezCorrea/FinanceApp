# Contracts: Migrar geolocalización de sesiones a IPinfo con caché

**Sin cambios al contrato público.** Esta feature es un swap interno de implementación:

- `GeoIpLookup.lookup(ip): Promise<GeoLocation>` (backend, `user/application/geoip-lookup.ts`)
  mantiene exactamente la misma firma y forma de retorno (`{country: string | null, city: string |
null}`) — solo cambia CÓMO resuelve el valor por dentro (caché → IPinfo → MaxMind → nada, en vez de
  solo MaxMind → nada).
- `Session.country`/`Session.city`, ya expuestos en `packages/contracts/src/auth/index.ts` desde
  specs/023, no ganan ni pierden ningún campo. `city` simplemente deja de recibir un valor nuevo para
  las sesiones creadas por el camino IPinfo — el campo en sí no cambia de tipo ni de nombre.
- No se agrega ningún endpoint HTTP. La tabla `ip-geolocation-cache` es un detalle interno del
  backend, sin controller propio (mismo trato que `idempotency-record`) — nada la expone ni la
  consume desde el frontend.
- `packages/contracts` no gana ningún schema, tipo, ni constante nueva.

**Nueva variable de entorno** (no es "contrato" en el sentido de API, pero es superficie de
configuración pública del backend): `IPINFO_TOKEN`, documentada en `apps/api/.env.example`.
