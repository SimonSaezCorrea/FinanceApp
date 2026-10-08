# Research: Perfil como ajustes por secciones (029)

Todas las decisiones abajo resuelven lo que el spec dejó para el plan. No hubo `NEEDS CLARIFICATION`
abiertos tras `/speckit-clarify`.

## R1. Rutas anidadas bajo `/profile`

- **Decision**: `/profile` pasa a ser una ruta padre con hijos `index` (Resumen), `personal`,
  `security`, `preferences`, `privacy`, más un comodín `*` que redirige (`replace`) a `/profile`.
  Cada hijo lleva su propio `handle.title` para el título de la pestaña (`DocumentTitle` ya lee el
  `handle` más profundo).
- **Rationale**: FR-005/FR-006 piden una dirección por sección, recarga sin perder el lugar y
  "atrás" funcionando. react-router v8 lo da gratis con rutas anidadas; el layout (`ProfileLayout`)
  queda montado entre secciones, así que cambiar de sección no recarga la identidad ni los datos.
- **Alternatives**: `?section=` en la query (descartado en clarify, opción C); un estado local sin
  URL (rompe FR-005).

## R2. Dos paneles vs. lista → pantalla: decidido por el ancho del contenedor

- **Decision**: `ProfileLayout` mide su propio ancho con `useElementWidth` (ResizeObserver, ya
  existente) contra una constante nueva `PROFILE_PANES_MIN_WIDTH = 820` (px de contenedor):
  - `≥ 820`: dos paneles. La navegación de secciones a la izquierda (280 px, fija con `sticky`) y
    la sección activa (`<Outlet />`) a la derecha; `/profile` muestra Resumen.
  - `< 820` (o aún sin medir): una columna. En `/profile` se ve la vista inicial (identidad +
    Resumen sin ajustes rápidos —protección, tus datos, sesiones— + lista de secciones); en
    `/profile/<sección>` solo la sección, con un control "volver" que navega a `/profile`.
- **Rationale**: es la convención de `CLAUDE.md` ("Container-width layouts"): la barra lateral
  colapsable cambia el espacio disponible, así que la decisión pertenece al ancho del propio
  elemento, no al viewport. 820 = 280 de navegación + 32 de separación + ~508 de contenido, el mínimo
  en que las filas de Seguridad (icono, título, estado, botón) no se parten. Con la barra lateral
  abierta (240) a 1024 px de viewport quedan ~736 → una columna; contraída (72) → ~900 → dos paneles.
  Hasta medir, la forma angosta es segura en cualquier ancho (mismo criterio que
  `AccountDetailRoute`).
- **Alternatives**: breakpoint de viewport `lg` (descartado: con la barra abierta, a 1024 los dos
  paneles quedan apretados); `xl` (desperdicia tablets anchas con la barra contraída).

## R3. Etapas de protección y "siguiente paso" (lógica pura)

- **Decision**: un módulo puro `domains/profile/lib/profileStatus.ts` con:
  - `protectionStages({ mfaEnabled, passkeyCount, passkeysSupported })` → tres etapas en orden fijo
    `password | passkey | twoFactor`, cada una `{ key, done, available }`. `password.done` es
    siempre `true` (toda cuenta tiene contraseña; supuesto del spec). `passkey.available` =
    `passkeysSupported`.
  - `nextProtectionStep(stages)` → la primera etapa `!done && available`, o `null` (FR-010/010a).
  - `contactCompleteness(user)` → `{ items: [email, identity, phone], done, total: 3 }` (FR-011,
    sin foto).
  - `sessionsPreview(sessions, max = 3)` → abiertas (`closedAt === null`), la actual primero, luego
    `lastUsedAt` descendente; devuelve `{ shown, hiddenCount }` (FR-012).
  - `sectionStatus(...)` → línea de estado + `needsAction` por sección (FR-002).
- **Rationale**: Principio IV (TDD): todas las reglas del resumen quedan testeables sin renderizar.
  Las mismas funciones alimentan el Resumen, la lista de secciones y la vista inicial del teléfono,
  así no pueden contradecirse.
- **Alternatives**: calcular en cada componente (duplicación y riesgo de divergencia entre resumen
  y lista).

## R4. Detección de soporte de llaves de acceso

- **Decision**: agregar `isPasskeySupported(): boolean` a `shared/lib/webauthn.ts`:
  `typeof window !== "undefined" && typeof window.PublicKeyCredential === "function"`.
- **Rationale**: es la condición mínima para que `navigator.credentials.create()` exista. Es
  síncrona (no hace falta `isUserVerifyingPlatformAuthenticatorAvailable`, que excluiría llaves
  físicas válidas). Junto a los helpers WebAuthn existentes.
- **Alternatives**: `isUserVerifyingPlatformAuthenticatorAvailable()` (async, y una llave física
  USB sí sirve aunque no haya biometría).

## R5. Datos del resumen: sin endpoints nuevos

- **Decision**: el Resumen reutiliza lo que ya existe: `useAuth().user` (`mfaEnabled`, `email`,
  `identifierValue`, `phone`), `usePasskeysQuery()` (cantidad), `useSessionsQuery()` (sesiones) y
  `useProfileStats()` (cuentas, movimientos del mes). Mientras una query carga o falla, su bloque
  muestra el estado correspondiente (`Skeleton` / `ErrorState inline` con reintentar) y la etapa
  afectada no se marca ni completa ni pendiente (FR-014).
- **Rationale**: el spec declara cero cambios de datos y de reglas; el backend ya expone todo.
- **Alternatives**: un endpoint agregador `/auth/me/summary` (innecesario; tres queries ya
  cacheadas por TanStack Query y compartidas con Seguridad).

## R6. Tema de tres opciones

- **Decision**: un componente compartido `shared/ui/theme-segmented.tsx` (Claro / Oscuro / Sistema,
  segmentos de 44 px con nombre e icono, `role="group"` + `aria-pressed`), extraído del
  `MenuThemeSwitch` del menú móvil de la landing, que pasa a usarlo. Escribe con
  `useTheme().setMode`; `ThemeSync` ya persiste el cambio en el backend (`User.theme` admite
  `system`).
- **Rationale**: FR-013/FR-020 piden que Preferencias y el ajuste rápido del Resumen cambien la misma
  preferencia que el selector existente; `setMode` es exactamente ese camino. Un solo componente
  evita tres implementaciones del mismo control.
- **Alternatives**: reutilizar `ThemeToggle` (tiras de 28 px solo con icono: no cumple FR-025 en
  teléfono).

## R7. Salir con una edición sin guardar

- **Decision**: `PersonalInfoSection` (la única sección con edición en línea) calcula `dirty`
  (borrador ≠ valor guardado de la fila abierta) y usa `useBlocker` de react-router: si `dirty`,
  bloquea la navegación dentro de la app (otra sección, "volver", "atrás") y muestra un
  `ConfirmModal` "¿Descartar cambios?" (Descartar → `blocker.proceed()`; Seguir editando →
  `blocker.reset()`). **No** se registra `beforeunload`: recargar o cerrar descarta sin preguntar
  (clarificación 2).
- **Rationale**: mismo mecanismo que `AccountEditPanel` (que sí usa `beforeunload`; aquí se omite
  a propósito por la decisión del usuario). El resto de los ajustes guarda al instante (selects,
  interruptores), así que no tienen estado sin guardar; los diálogos (contraseña, dos pasos, llaves)
  son modales y se cierran a sí mismos.
- **Alternatives**: guardar al salir (opción C, descartada); descartar en silencio (opción A,
  descartada).

## R8. Acciones del Resumen que llevan a "un punto" de otra sección

- **Decision**:
  - Etapas pendientes → `/profile/security#two-factor` o `#passkeys`; la sección Seguridad hace
    `scrollIntoView` + foco en el bloque con ese `id` al montar si hay hash.
  - Dato faltante → `/profile/personal?edit=phone` (o `identifier`/`email`); `PersonalInfoSection`
    abre esa fila en edición (reemplaza el `editRequest` en memoria que hoy pasa
    `AccountStatusSection`) y limpia el parámetro con `replace` para que recargar no reabra.
  - Sesiones → `/profile/security#sessions`.
- **Rationale**: direcciones reales (enlazables y con "atrás") en vez de estado en memoria; el
  `editRequest` actual depende de que ambos componentes estén montados a la vez, cosa que ya no
  ocurre en el teléfono.

## R9. Qué se elimina, qué se reubica

- **Decision**:
  - Eliminar: `NotificationsSection`, `DataPrivacySection` (placeholders: interruptores inertes y
    "Exportar" deshabilitado), `AccountStatusSection` (reemplazada por la completitud del Resumen,
    sin foto ni promesa de SMS), y el uso de `CollapsibleSection` en Perfil (el primitivo queda en
    `shared/ui` por si lo usa otra vista).
  - Reubicar: `PersonalInfoSection` → Información personal; `SecuritySection` (contraseña, dos
    pasos, llaves, sesiones, sin el acordeón) → Seguridad; `PreferencesSection` +
    `FinancialCustomizationSection` (monedas extra, ocultar saldos) → Preferencias;
    `ConsentHistorySection` + `DangerZone` → Datos y privacidad; `ProfileCard` → identidad compacta
    en la cabecera de la navegación (iniciales, nombre o correo, cuentas, movimientos del mes, año).
  - "Próximamente": un texto único (notificaciones, exportar movimientos, respaldo automático, foto
    de perfil) bajo la navegación en dos paneles y al final de la lista en el teléfono.
  - Claves i18n que solo usaban los placeholders (`profile.notifications.*`,
    `profile.dataPrivacy.*`, `profile.accountStatus.*`, `profile.preferences.darkTheme`) se borran
    de es y en (paridad la verifica `i18n/parity.test.ts`).
- **Rationale**: FR-021/FR-022/FR-023 y "sin regresiones" (FR-015..018).

## R10. Tests

- **Decision**: TDD por historia:
  - Unit puro: `profileStatus.test.ts` (etapas, siguiente paso con y sin soporte de llaves,
    completitud 0..3, preview de sesiones con 1, 2 y 5 abiertas + cerradas, líneas de estado).
  - Componentes: `ProfileSummary.test.tsx`, `ProfileSectionNav.test.tsx`,
    `ThemeSegmented.test.tsx`.
  - Rutas: `ProfileRoutes.test.tsx` con `MemoryRouter`: dirección directa a cada sección, comodín →
    `/profile`, forma angosta (lista → sección → volver), forma ancha (navegación + Resumen), acción
    "Agregar teléfono" abre la fila, guard de "¿Descartar cambios?" al navegar con la fila sucia.
  - Adaptar los tests existentes de las secciones reubicadas (quitar el acordeón, misma conducta);
    borrar `placeholders.test.tsx` y `AccountStatusSection.test.tsx`.
  - `useElementWidth` se simula en los tests de forma (jsdom no tiene ResizeObserver real).
- **Rationale**: Principio IV; SC-005 exige cero regresiones en las pruebas existentes adaptadas.
