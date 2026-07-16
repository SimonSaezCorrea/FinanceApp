# Research: Perfil de Usuario

Todas las decisiones técnicas necesarias eran resolubles con defaults razonables dado el stack ya
ratificado (constitución 1.5.1) y los patrones existentes en el código. No quedan `NEEDS
CLARIFICATION` — se documentan aquí las decisiones y su justificación.

## 1. ¿Dominio backend nuevo (`users`/`profile`) o extender `auth`?

- **Decision**: Extender el dominio `auth` existente (`apps/api/src/domains/auth/`).
- **Rationale**: `User` ya es la entidad que `auth` posee y gestiona (`auth.repository.ts`). Todas las
  operaciones de esta feature (editar nombre/email, cambiar contraseña, preferencias, desactivar) son
  mutaciones sobre esa misma fila. Crear un dominio nuevo solo para separar "perfil" de "credenciales"
  duplicaría el repositorio/servicio sin aportar un límite de negocio real.
- **Alternatives considered**: dominio `users` separado — rechazado por no haber ninguna otra entidad
  o regla de negocio que lo justifique hoy (sería un módulo con un solo modelo, calcado de `auth`).

## 2. ¿Cómo forzar que una cuenta deshabilitada pierda acceso "a más tardar en su siguiente acción autenticada"?

- **Decision**: `JwtAuthGuard` pasa de validar solo la firma del JWT a también leer `status` desde la
  DB (lookup por PK, ya indexada) y rechazar con 401 si `DISABLED`. `rotateFromRefresh` hace el mismo
  check (ya toca la DB por `findById`, así que es gratis agregarlo ahí).
- **Rationale**: Los access tokens son stateless (15 min por defecto); sin este chequeo, una cuenta
  recién desactivada conservaría acceso hasta que expire su access token vigente, lo cual viola FR-010
  ("a más tardar en su siguiente acción que requiera autenticación"). El costo es una lookup por PK
  adicional por request — aceptable para el volumen de esta app (uso personal/doméstico, no un
  servicio de alto tráfico).
- **Alternatives considered**: esperar a la expiración natural del access token (15 min) — rechazado,
  no cumple el criterio de aceptación de FR-010/SC-004 tal como está redactado (rechazo inmediato de
  login, y la sesión activa no debería seguir funcionando ese margen).

## 3. ¿Dónde y cómo persistir moneda/idioma/formato de fecha/tema?

- **Decision**: Nuevas columnas en `User`: `preferredCurrency String @default("CLP")`,
  `locale String @default("es")`, `dateFormat String @default("DD/MM/YYYY")`,
  `theme String @default("dark")`. Se exponen y editan vía `PATCH /auth/me/preferences`.
- **Rationale**: Sigue el mismo patrón ya usado para moneda en `BankAccount.currency` (string ISO 4217
  de 3 letras, no un enum/tabla nueva). `locale`/`dateFormat`/`theme` son 2-3 valores fijos cada uno;
  un enum de Prisma es más rígido que un string validado en el contrato zod (`z.enum([...])`) y no
  aporta nada aquí, así que se valida en la capa de contratos, igual que el resto del dominio.
- **Alternatives considered**: tabla `UserPreference` separada (1:1 con `User`) — rechazada por
  sobre-ingeniería: son 4 escalares sin ciclo de vida propio, no ameritan una tabla aparte.

## 4. Tema: hoy es 100% client-side (`localStorage`). ¿Se reemplaza o se sincroniza?

- **Decision**: Se mantiene `localStorage` como fuente inmediata (necesaria para pintar el tema antes
  de que resuelva la carga de `auth.me()`, incl. en `/login`), y se sincroniza con el backend: al
  cargar `me()`, si el tema del backend difiere del local, el backend gana y se actualiza
  `localStorage`; al cambiar el tema (desde el toggle del sidebar o desde Preferencias en Perfil) se
  actualiza el estado local de inmediato y se dispara un `PATCH /auth/me/preferences` en background.
- **Rationale**: El diseño (FR-007a) trata "Tema oscuro" en Preferencias como la misma preferencia que
  ya expone el sidebar, no una nueva — deben compartir el mismo `ThemeContext`. Pero el tema debe
  poder pintarse antes de que la sesión resuelva (evitar flash), de ahí que `localStorage` no
  desaparezca.
- **Alternatives considered**: mover el tema 100% a backend (sin localStorage) — rechazado, causaría
  flash de tema incorrecto en cada carga hasta que resuelva `auth.me()`, y rompería el tema en
  `/login`/`/register` (rutas sin sesión).

## 5. ¿De dónde salen las estadísticas (cuentas activas, movimientos del mes, miembro desde)?

- **Decision**: Se calculan en el frontend agregando llamadas a los endpoints ya existentes
  (`GET /accounts?status=active` para el conteo, `GET /transactions` filtrado por mes actual para el
  conteo, y `createdAt` de `currentUserSchema` para el año) — mismo patrón que ya usa el Panel
  (`domains/dashboard`), descrito en la arquitectura como "frontend-only aggregation".
- **Rationale**: Evita construir un endpoint de agregación cross-dominio nuevo en el backend para un
  dato que ya es derivable con las APIs existentes, consistente con cómo se resolvió el Panel.
- **Alternatives considered**: endpoint `GET /auth/me/stats` en el backend — rechazado por ahora
  (duplicaría lógica de conteo que `accounts`/`transactions` ya exponen filtrable); se puede
  reconsiderar si el volumen de requests del frontend se vuelve un problema real.

## 6. `createdAt` en `User` para "miembro desde" — ¿cómo tratar las cuentas ya existentes?

- **Decision**: Se agrega `createdAt DateTime @default(now())` a `User`. Al aplicar `prisma db push`,
  las filas existentes reciben el timestamp del momento del `db push` (no el de su registro real,
  porque ese dato nunca se capturó).
- **Rationale**: Coincide exactamente con el supuesto ya documentado en `spec.md` ("para usuarios
  existentes sin fecha de creación registrada, se completa con un valor razonable por defecto").
  `db push` con `@default(now())` es el mecanismo estándar del repo (no hay carpeta de migrations;
  ya se usó un patrón similar de backfill en specs/007 vía SQL directo cuando hacía falta preservar un
  valor real — aquí no hay valor real que preservar, así que no aplica ese paso extra).
- **Alternatives considered**: backfill manual con una fecha estimada por usuario — rechazado, no hay
  ninguna señal confiable de la fecha real de alta de los usuarios semilla/demo existentes.

## 7. Primitivo de UI: switch tipo "knob"

- **Decision**: Se crea `apps/web/src/shared/ui/switch.tsx`, un primitivo controlado
  (`checked`, `onCheckedChange`, `disabled?`) con las clases de token existentes, mirror de estilo de
  `segmented.tsx`/`theme-toggle.tsx`. Los switches de 2FA/notificaciones lo usan con `disabled` (o
  simplemente sin persistir el `onCheckedChange`) para cumplir FR-008 (inertes).
- **Rationale**: No existe hoy un primitivo de switch en `shared/ui`; el diseño lo requiere en 5
  lugares (tema, 2FA, 3 notificaciones). Construirlo una vez como primitivo evita 5 implementaciones
  ad-hoc.
- **Alternatives considered**: usar `<input type="checkbox">` estilizado inline en cada sección —
  rechazado, rompe la convención de primitivos compartidos que ya sigue el resto de `shared/ui`.

## 8. Confirmación de "Eliminar cuenta" (reingreso de contraseña)

- **Decision**: Se reutiliza el primitivo `confirm-dialog.tsx` ya existente, extendido con un campo de
  contraseña; el backend valida la contraseña (bcrypt `compare`, mismo mecanismo que login) antes de
  marcar `status = DISABLED` y responde limpiando las cookies de sesión (mismo efecto que `logout`).
- **Rationale**: Reutiliza infraestructura ya validada (bcrypt, cookies) en vez de introducir un nuevo
  mecanismo de confirmación.
