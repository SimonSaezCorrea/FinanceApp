# Research: Sesiones y dispositivos reales

## R1 — Qué es un "session id" en un modelo JWT sin estado

**Decision**: el modelo actual (`TokenIssuer`) firma access+refresh tokens completamente
sin estado — ningún claim identifica una sesión, así que hoy es estructuralmente
imposible revocar un refresh token específico sin tocarlo todo. Se introduce un claim
nuevo, **`sid`** (session id), en AMBOS tokens (access y refresh) de un mismo login. El
`sid` es literalmente el `id` (UUID v7) de la fila nueva `Session` — no se guarda el JWT
ni un hash de él en la base, solo su identificador. Revocar = borrar la fila; validar =
que la fila siga existiendo.

**Rationale**: evita guardar/hashear tokens (superficie de ataque extra, y un cambio más
grande al esquema de firma existente) y reutiliza exactamente el patrón que
`rowId`/UUID v7 ya estandarizó (Principio VIII) — el "identificador de sesión" es un
identificador de fila como cualquier otro.

**Alternatives considered**: guardar el refresh token completo (o su hash) en la fila y
comparar en cada refresh — más trabajo, sin ventaja real ya que el `sub`+`sid` ya
identifican la sesión unívocamente; una lista de revocación (deny-list) separada del
modelo de filas — redundante con lo anterior.

## R2 — Revocación "de inmediato" también para el access token en curso

**Decision**: `JwtAuthGuard` ya hace una consulta a la BD en cada request para chequear
`User.status` (Principio II, "por-request DB check"). Se extiende esa MISMA consulta
para también verificar que la sesión (`sid` del access token) siga existiendo — si fue
cerrada, el guard rechaza igual que hoy rechaza una cuenta `DISABLED`.

**Rationale**: sin esto, "cerrar sesión" solo bloquearía el PRÓXIMO refresh — el access
token ya emitido (vive hasta 15 min, `JWT_ACCESS_EXPIRES`) seguiría funcionando, lo que
contradice FR-005/SC-002 ("de inmediato") y el edge case explícito del spec sobre cerrar
la sesión propia. El costo es el mismo patrón que ya existe (un guard que ya pega a la
BD una vez por request); no se introduce una consulta nueva de más, solo se amplía el
`select`/where de la que ya corre.

**Alternatives considered**: aceptar hasta 15 min de gracia (documentarlo como
limitación) — se descarta porque el spec pide explícitamente inmediatez y el mecanismo
para lograrlo de verdad no cuesta una consulta adicional.

## R3 — Dónde vive la fila de sesión: dominio-tabla propio

**Decision**: nuevo dominio-tabla `session` (tabla `session`), mismo tratamiento que
`passkey`/`mfa-recovery-code` — sin `presentation/` propia (no expone su propio
controller; el Facade sigue siendo `auth.controller.ts`), compuesto en `user` vía un
`session.data.module.ts` leaf.

**Rationale**: Principio VI (una tabla = un dominio, un solo adapter la consulta).

## R4 — Dispositivo/navegador: parseo del User-Agent, una sola vez

**Decision**: al crear la sesión (login/registro), se parsea el header `User-Agent` de
esa request con una librería (`ua-parser-js`, dependencia nueva solo en `apps/api`) y se
guarda el resultado YA COMO TEXTO LEGIBLE (ej. `"Chrome · Windows"`) en la fila, no el
User-Agent crudo. La lista de sesiones nunca vuelve a parsear nada.

**Rationale**: parsear una vez en escritura es más barato que parsear en cada lectura de
la lista, y evita que una librería vieja/actualizada cambie retroactivamente cómo se ve
una sesión ya creada.

**Alternatives considered**: guardar el User-Agent crudo y parsear al leer — se
descarta por el costo repetido y porque el crudo no aporta nada que el usuario necesite
ver.

## R5 — País aproximado: GeoLite2 local, "inerte" sin configurar (mismo patrón que S3)

**Decision**: lookup de IP→país vía **`maxmind`** (lector liviano de archivos `.mmdb`,
sin llamada de red), contra un archivo GeoLite2-Country que el operador descarga con su
propia cuenta gratuita de MaxMind y apunta con la env var nueva **`GEOIP_DB_PATH`**. Si
la variable no está seteada o el archivo no existe, el lookup de país es un no-op — la
sesión se crea igual, sin país (`country: null`) — exactamente el mismo "inerte sin
credenciales" que `ObjectStoragePort`/S3 ya establece para adjuntos.

**Rationale**: evita depender de un servicio HTTP externo en el camino crítico de login
(latencia + punto de falla nuevo) y evita bloquear el desarrollo local de quien no tenga
—o no quiera crear— una cuenta MaxMind: la feature completa (dispositivo, cerrar
sesiones) funciona igual, solo sin el dato de país.

**Alternatives considered**: API HTTP externa (ip-api.com, ipapi.co) resuelta en cada
login — descartada (latencia en el login, límites de uso gratuitos bajos, dependencia de
red externa en un flujo crítico); paquete `geoip-lite` (empaqueta su propia base
desactualizada, sin necesidad de cuenta) — descartado por mantenimiento y freshness de
datos inciertos frente a una base GeoLite2 real que el operador puede refrescar.

## R6 — Rotación de refresh token conserva el `sid`, no lo reemplaza

**Decision**: `RefreshTokenHandler` ya emite un par de tokens NUEVO en cada refresh
(rotación completa). Con `sid`, esa rotación reutiliza el `sid` de la sesión existente —
`TokenIssuer.issue()` gana un parámetro `sessionId?` opcional: si se pasa, lo usa como
`sid` (caso refresh); si no, genera uno nuevo vía `generateRowId()` (caso
login/registro). El refresh además actualiza `Session.lastUsedAt` y extiende
`Session.expiresAt` a `now + JWT_REFRESH_EXPIRES` (sesión "deslizante", igual que hoy ya
desliza la validez del refresh token mismo).

**Rationale**: la IDENTIDAD de la sesión (qué dispositivo es, desde cuándo existe) no
debe cambiar solo porque el token rotó — es el mismo login continuando, no uno nuevo.

## R7 — `Session.expiresAt` explícito en vez de derivarlo de `createdAt`

**Decision**: columna propia `expiresAt`, seteada a `now + JWT_REFRESH_EXPIRES` en la
creación y actualizada en cada refresh (ver R6) — no se deriva de `createdAt` +
constante, porque la constante puede cambiar (env var) y una sesión creada bajo un valor
viejo no debe reinterpretarse con el valor nuevo.

**Rationale**: permite que tanto la consulta de LISTAR (filtra `expiresAt > now`, FR-007)
como el cron de purga (R8) usen el mismo campo sin recalcular nada.

## R8 — Purga real, no soft-delete (FR-010)

**Decision**: cerrar una sesión (individual, "cerrar todas las demás", o el propio
`logout`) hace un DELETE real de la fila, no un flag de estado. Un cron diario nuevo
(`SessionCleanupCron`, mismo patrón que `IdempotencyCleanupCron` /
`BillingGenerationCron`) además purga cualquier fila con `expiresAt` vencido que nadie
haya cerrado explícitamente — defensa en profundidad: la consulta de listar YA filtra
`expiresAt > now` (FR-007 se cumple igual sin el cron), pero sin el cron esas filas
vencidas quedarían acumulando espacio indefinidamente.

**Rationale**: decisión explícita del usuario en `/speckit-clarify` — sin retención de
historial de sesiones pasadas.

## R9 — Alcance NO cubierto: password change / MFA disable no revocan sesiones existentes

**Decision**: confirmado como fuera de alcance en el spec (Assumptions) — esta feature
NO modifica `ChangePasswordHandler`/`DisableMfaHandler` para revocar otras sesiones. Se
documenta en `docs/PENDING.md` como limitación conocida y deliberada, la misma forma que
ya existen otras limitaciones documentadas en este proyecto (ej. "recargar la página
pierde la idempotency key").

**Rationale**: mantener el alcance acotado a lo pedido; abrir esa puerta implica decidir
si "cambiar contraseña" debería cerrar todo excepto la sesión actual (mismo patrón que
"cerrar todas las demás") — una decisión de producto propia, no implícita en este pedido.

## R10 — Endpoints nuevos, mismo Facade

**Decision**: tres endpoints nuevos bajo `/auth`, guardados por `JwtAuthGuard`, en el
MISMO `AuthController` (Facade ya existente, no uno nuevo — `session` no tiene
`presentation/` propia, ver R3):
- `GET /auth/sessions` — lista las sesiones activas del usuario.
- `DELETE /auth/sessions/:id` — cierra una sesión propia.
- `POST /auth/sessions/revoke-others` — cierra todas menos la actual.

`logout` (ya existente) se amplía para además borrar la fila de la sesión que se está
cerrando, leyendo su `sid` del refresh token saliente antes de limpiar las cookies —
tolerante a un refresh token ausente/inválido (el logout del cliente igual debe
"funcionar" limpiando cookies, aunque no haya nada que borrar server-side).
