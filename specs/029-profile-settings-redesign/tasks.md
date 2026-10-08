---
description: "Task list for 029 — Perfil como ajustes por secciones con resumen de protección"
---

# Tasks: Perfil como ajustes por secciones con resumen de protección

**Input**: Design documents from `/specs/029-profile-settings-redesign/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/profile-routes.md, quickstart.md

**Tests**: INCLUIDOS. La constitución (Principio IV, TDD) los exige: en cada historia los tests se escriben primero y deben fallar antes de implementar.

**Organization**: por historia de usuario (spec.md). Todo el trabajo está en `apps/web/src/` (solo frontend; cero cambios de API).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: paralelizable (archivo distinto, sin dependencias pendientes)
- **[Story]**: US1–US4 según spec.md

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: utilidades compartidas que usan varias historias.

- [x] T001 [P] Primero escribir el test (debe fallar) en `apps/web/src/shared/lib/webauthn.test.ts` (crear si no existe) para `isPasskeySupported()` con `window.PublicKeyCredential` presente y ausente; después implementar `isPasskeySupported(): boolean` (`typeof window !== "undefined" && typeof window.PublicKeyCredential === "function"`) con su doc-comment en `apps/web/src/shared/lib/webauthn.ts`
- [x] T002 [P] Agregar la constante exportada `PROFILE_PANES_MIN_WIDTH = 820` con comentario (280 navegación + 32 separación + ~508 contenido; ver research R2) en `apps/web/src/shared/lib/useElementWidth.ts`
- [x] T003 [P] Crear `apps/web/src/domains/profile/lib/profileSections.ts`: tipo `ProfileSectionKey` (`summary|personal|security|preferences|privacy`), grupos (`account|app|privacy`) y la lista ordenada `PROFILE_SECTIONS` con `key`, `path` (`""`, `personal`, `security`, `preferences`, `privacy`), `group`, `titleKey` (`profile.sections.<key>.title`) e `icon` (Lucide), según data-model.md

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: rutas anidadas y layout mínimo. Al terminar, cada sección existente es alcanzable por su dirección y nada de lo actual se pierde.

**⚠️ CRITICAL**: ninguna historia empieza antes de cerrar esta fase.

- [x] T004 Escribir `apps/web/src/domains/profile/routes/ProfileRoutes.test.tsx` (con `MemoryRouter` + `Routes` replicando el árbol de `/profile`, `Providers` y `authApi.me` mockeado) con los casos de dirección: `/profile/personal`, `/profile/security`, `/profile/preferences` y `/profile/privacy` muestran el encabezado de su sección; `/profile/inexistente` termina en `/profile`. Deben fallar.
- [x] T005 Crear los componentes de ruta delgados en `apps/web/src/domains/profile/routes/`: `SummaryRoute.tsx` (placeholder temporal con su `h1`), `PersonalRoute.tsx` (renderiza `PersonalInfoSection`), `SecurityRoute.tsx` (`SecuritySection`), `PreferencesRoute.tsx` (`PreferencesSection` + `FinancialCustomizationSection`), `PrivacyRoute.tsx` (`ConsentHistorySection` + `DangerZone`); cada uno con un `h1` con `tabIndex={-1}` y el título `profile.sections.<key>.title`
- [x] T006 Crear `apps/web/src/domains/profile/routes/ProfileLayout.tsx` mínimo: `<Outlet />` dentro del contenedor de la página (sin navegación todavía) y el título de página
- [x] T007 Reemplazar la ruta `/profile` en `apps/web/src/app/router.tsx` por una ruta padre con `ProfileLayout` y los hijos `index` (SummaryRoute), `personal`, `security`, `preferences`, `privacy` (cada uno con su `handle({ title: "profile.sections.<key>.title" })`) y `{ path: "*", element: <Navigate to="/profile" replace /> }`; borrar `apps/web/src/domains/profile/routes/ProfileRoute.tsx`
- [x] T008 Agregar a `apps/web/src/i18n/es.json` y `en.json` las claves `profile.sections.{summary,personal,security,preferences,privacy}.title` ("Resumen"/"Summary", "Información personal"/"Personal information", "Seguridad"/"Security", "Preferencias"/"Preferences", "Datos y privacidad"/"Data and privacy") y `profile.groups.{account,app,privacy}` ("Tu cuenta"/"Your account", "App"/"App", "Privacidad"/"Privacy"); correr T004 hasta verde

**Checkpoint**: las 5 direcciones funcionan; el comodín redirige; las secciones actuales siguen operativas (aún con su acordeón).

---

## Phase 3: User Story 1 — Ver de un vistazo qué tan protegida está mi cuenta (Priority: P1) 🎯 MVP

**Goal**: Resumen con protección en 3 etapas y siguiente paso realizable, completitud de datos sobre 3, hasta 3 sesiones y ajustes rápidos; sus acciones llevan al punto exacto de otra sección.

**Independent Test**: cuenta con contraseña + 1 llave y sin dos pasos → `/profile` lee "2 de 3", siguiente paso "Activar dos pasos", y ese botón lleva a `/profile/security#two-factor`.

### Tests for User Story 1 (escribir primero, deben fallar) ⚠️

- [x] T009 [P] [US1] Escribir `apps/web/src/domains/profile/lib/profileStatus.test.ts`: `protectionStages` (password siempre done; passkey done con ≥1; twoFactor según `mfaEnabled`; `done: null` mientras carga), `nextProtectionStep` (1 de 3 → passkey; 2 de 3 → twoFactor; 3 de 3 → null; sin soporte de llaves y passkey pendiente → twoFactor; sin soporte y solo falta la llave → null), `contactCompleteness` (0..3, la foto no cuenta, campos vacíos o `null` = faltan), `sessionsPreview` (1, 2 y 5 abiertas + cerradas ignoradas; actual primero; luego `lastUsedAt` desc.; `hiddenCount`)
- [x] T010 [P] [US1] Escribir `apps/web/src/domains/profile/components/ProfileSummary.test.tsx`: lee "2 de 3" y el siguiente paso; con las tres completas muestra protección completa sin siguiente paso; con passkeys sin soporte (mock de `isPasskeySupported`) la etapa dice "no disponible en este dispositivo"; datos 2 de 3 con acción "Agregar teléfono"; 5 sesiones → 3 visibles + "y 2 más"; sesiones cargando/fallidas muestran su estado y no inventan completitud; los ajustes rápidos cambian el tema (`useTheme().mode`) y ocultar saldos (llama `updatePreferences`); con `showQuickSettings={false}` no se renderizan los ajustes rápidos pero sí protección, datos y sesiones
- [x] T011 [P] [US1] Ampliar `apps/web/src/domains/profile/routes/ProfileRoutes.test.tsx`: "Activar dos pasos" navega a `/profile/security#two-factor`; "Agregar teléfono" navega a `/profile/personal?edit=phone` y deja la fila de teléfono en edición, y el parámetro desaparece de la URL; "Revisar sesiones" va a `/profile/security#sessions`

### Implementation for User Story 1

- [x] T012 [US1] Implementar `apps/web/src/domains/profile/lib/profileStatus.ts` (`protectionStages`, `nextProtectionStep`, `contactCompleteness`, `sessionsPreview`) según data-model.md hasta dejar T009 en verde
- [x] T013 [P] [US1] Primero escribir `apps/web/src/shared/ui/theme-segmented.test.tsx` (debe fallar: 3 opciones con nombre, `aria-pressed` en la activa, elegir Sistema deja `useTheme().mode === "system"`); después crear `apps/web/src/shared/ui/theme-segmented.tsx` (`ThemeSegmented`: Claro/Oscuro/Sistema, segmentos `h-11` con icono y nombre, `role="group"` + `aria-label`, `aria-pressed`, escribe con `useTheme().setMode`); reemplazar `MenuThemeSwitch` de `apps/web/src/domains/landing/components/LandingLayout.tsx` por `ThemeSegmented` (mismo aspecto, sin título visible) y verificar que `LandingRoutes.test.tsx` siga verde
- [x] T014 [US1] Crear `apps/web/src/domains/profile/components/ProtectionCard.tsx`: 3 etapas con línea de progreso, "N de 3", nota "no disponible en este dispositivo" cuando `!available`, recuadro "Siguiente paso" con botón (`Link` a `stage.target`) o estado "protección completa"; estados de carga/error con `Skeleton`/`ErrorState inline` (FR-014)
- [x] T015 [US1] Crear `apps/web/src/domains/profile/components/ProfileSummary.tsx`: `ProtectionCard`, tarjeta "Tus datos" (N de 3 + ítems + acción `Link` a `/profile/personal?edit=<campo>`), tarjeta "Sesiones" (`sessionsPreview`, "Esta" para la actual, "y N más", `Link` a `/profile/security#sessions`), tarjeta "Ajustes rápidos" (`ThemeSegmented` + `Switch` de ocultar saldos con `updatePreferences`, enlace a `/profile/preferences`) controlada por la prop `showQuickSettings` (por defecto `true`; la vista inicial del teléfono la pasa en `false`); datos desde `useAuth`, `usePasskeysQuery`, `useSessionsQuery`, `isPasskeySupported`; hasta T010 en verde
- [x] T016 [US1] Reemplazar el placeholder de `apps/web/src/domains/profile/routes/SummaryRoute.tsx` por encabezado + `ProfileSummary`
- [x] T017 [US1] En `apps/web/src/domains/profile/components/PersonalInfoSection.tsx`: leer `?edit=email|phone|identifier` con `useSearchParams`, abrir esa fila en edición al montar, quitar el parámetro con `setSearchParams(..., { replace: true })`, ignorar valores desconocidos; eliminar la prop `editRequest` y su manejo (lo reemplaza la URL)
- [x] T018 [US1] En `apps/web/src/domains/profile/components/SecuritySection.tsx`: dar `id` a los bloques (`password`, `two-factor`, `passkeys`, `sessions`) y, al montar con `location.hash` coincidente, `scrollIntoView({ block: "start" })` + foco en el encabezado del bloque; hasta T011 en verde
- [x] T019 [US1] Agregar claves `profile.summary.*` en `apps/web/src/i18n/es.json` y `en.json`: título y subtítulo, protección (`title`, `progress` "{{done}} de 3"/"{{done}} of 3", etapas `password`/`passkey`/`twoFactor` con nombre y descripción, `notAvailable` "No disponible en este dispositivo", `nextStep`, acciones `addPasskey`/`enableTwoFactor`, `complete`), datos (`title`, `items.email|identity|phone`, `add.phone|identity|email`), sesiones (`title`, `open_one`/`open_other`, `current`, `more` "y {{count}} más"/"and {{count}} more", `review`), ajustes rápidos (`title`, `allPreferences`)

**Checkpoint**: US1 completa y testeable sola: `/profile` muestra el Resumen funcional (aunque todavía sin la navegación de dos paneles).

---

## Phase 4: User Story 2 — Ir directo a la sección que necesito, en cualquier dispositivo (Priority: P1)

**Goal**: navegación agrupada con línea de estado; dos paneles o lista → pantalla según el ancho del contenedor; "volver"; "¿Descartar cambios?" al navegar con una edición sin guardar.

**Independent Test**: abrir `/profile/security` en forma angosta: se ve Seguridad con "volver"; "volver" y "atrás" regresan a la vista inicial; en forma ancha, la navegación marca Seguridad como actual.

### Tests for User Story 2 (escribir primero, deben fallar) ⚠️

- [x] T020 [P] [US2] Ampliar `apps/web/src/domains/profile/lib/profileStatus.test.ts` con `sectionStatus` (incluido el número del indicador, FR-002): Resumen ("N pasos pendientes" = etapas pendientes realizables + datos faltantes, o "Todo en orden"; sin soporte de llaves la etapa de llave no suma), Información personal ("Falta tu teléfono"/"Faltan N datos"/"Datos completos"), Seguridad ("Dos pasos desactivada" o "N sesiones abiertas"), Preferencias (moneda · idioma · tema, sin acción), Datos y privacidad (consentimientos vigentes, sin acción)
- [x] T021 [P] [US2] Escribir `apps/web/src/domains/profile/components/ProfileSectionNav.test.tsx`: renderiza los 3 grupos en orden con sus secciones, la línea de estado y el indicador en las que requieren acción, `aria-current="page"` en la activa, cada ítem es un enlace a su dirección con área ≥ 44 px (`min-h-11`)
- [x] T022 [P] [US2] Ampliar `apps/web/src/domains/profile/routes/ProfileRoutes.test.tsx` (mockeando `useElementWidth` para forzar cada forma): ancho → navegación + Resumen en `/profile`; angosto → en `/profile` identidad + Resumen sin ajustes rápidos (protección, "Tus datos" con "Agregar teléfono", sesiones) + lista, y en `/profile/security` solo la sección con botón "volver" que lleva a `/profile`; cambiar de forma con una sección abierta conserva la sección; con la fila de teléfono sucia, elegir otra sección muestra "¿Descartar cambios?", "Seguir editando" conserva el texto y "Descartar" navega; sin cambios navega directo; no se registra `beforeunload`

### Implementation for User Story 2

- [x] T023 [US2] Implementar `sectionStatus` en `apps/web/src/domains/profile/lib/profileStatus.ts` hasta T020 en verde
- [x] T024 [P] [US2] Primero escribir `apps/web/src/domains/profile/components/ProfileIdentity.test.tsx` (debe fallar: sin nombre muestra el correo; muestra cuentas, movimientos del mes y año de ingreso; "–" mientras cargan las estadísticas); después crear `ProfileIdentity.tsx` (iniciales en círculo con color de token, nombre o correo, correo si hay nombre, "N cuentas · M movimientos este mes · miembro desde AAAA" desde `useProfileStats` y `user.memberSinceYear`, FR-019; variantes `compact` para la cabecera de la navegación y `full` para la vista inicial angosta)
- [x] T025 [US2] Crear `apps/web/src/domains/profile/components/ProfileSectionNav.tsx`: lista agrupada desde `PROFILE_SECTIONS` con `NavLink` (`end` en el índice), icono, título, línea de estado (`sectionStatus`) e indicador (`Badge` warn con el número); prop `variant: "panel" | "list"` (panel: fondo `bg-surface2` en la activa; list: filas de 60 px con chevron, para la vista inicial angosta); hasta T021 en verde
- [x] T026 [US2] Completar `apps/web/src/domains/profile/routes/ProfileLayout.tsx`: `useElementWidth` sobre el contenedor; forma `panes` (≥ `PROFILE_PANES_MIN_WIDTH`): grid `280px | 1fr`, a la izquierda `ProfileIdentity compact` + `ProfileSectionNav panel` (sticky) y a la derecha `<Outlet />`; forma `stack` (o sin medir): en el índice, la vista inicial = `ProfileIdentity full` + `ProfileSummary showQuickSettings={false}` (protección, tus datos, sesiones) + `ProfileSectionNav list`, y en una sección una barra con botón "volver" (`Link` a `/profile`, `aria-label`) + `<Outlet />` (spec FR-004)
- [x] T027 [US2] En `apps/web/src/domains/profile/components/PersonalInfoSection.tsx`: calcular `dirty` (borrador de la fila abierta ≠ valor guardado), `useBlocker(() => dirty)` y un `ConfirmModal` "¿Descartar cambios?" (Descartar → `blocker.proceed()`, Seguir editando → `blocker.reset()`); sin `beforeunload`; hasta T022 en verde
- [x] T028 [US2] Agregar claves en `apps/web/src/i18n/es.json` y `en.json`: `profile.status.*` (líneas de estado con plurales `_one`/`_other`), `profile.nav.back` ("Volver a Perfil"/"Back to Profile"), `profile.nav.label`, `profile.discard.{title,description,confirm,cancel}` ("¿Descartar cambios?", "Lo que escribiste no se guardará.", "Descartar", "Seguir editando" y su inglés)

**Checkpoint**: US1 + US2 forman el MVP completo: estructura de dos paneles/lista, Resumen y navegación con historial.

---

## Phase 5: User Story 3 — Todo lo que hoy funciona sigue funcionando, en su lugar (Priority: P2)

**Goal**: cada sección existente vive en su ruta sin acordeón y conserva su conducta.

**Independent Test**: los tests existentes de cada sección, adaptados a su nueva ubicación, pasan sin cambiar sus aserciones de conducta.

### Tests for User Story 3 ⚠️

- [x] T029 [P] [US3] Adaptar `apps/web/src/domains/profile/components/PersonalInfoSection.test.tsx` y `SecuritySection.test.tsx`: quitar la apertura del acordeón; mismas aserciones de edición por fila, contraseña, dos pasos y sesiones (incluido el step-up)
- [x] T030 [P] [US3] Adaptar `apps/web/src/domains/profile/components/PasskeySection.test.tsx`, `FinancialCustomizationSection.test.tsx`, `ConsentHistorySection.test.tsx` y `DangerZone.test.tsx` al render sin acordeón (mismas aserciones de conducta)

### Implementation for User Story 3

- [x] T031 [US3] Quitar `CollapsibleSection` de `PersonalInfoSection.tsx`, `SecuritySection.tsx`, `PreferencesSection.tsx`, `FinancialCustomizationSection.tsx` y `ConsentHistorySection.tsx` en `apps/web/src/domains/profile/components/`, reemplazándolo por bloques `Card` con subtítulo cuando el contenido lo necesite (el `h1` lo pone la ruta); `PersonalInfoSection` pierde su estado `open`
- [x] T032 [US3] Componer `apps/web/src/domains/profile/routes/PreferencesRoute.tsx` en dos bloques: "Apariencia e idioma" (tema, idioma) y "Monedas y montos" (moneda principal, monedas extra, ocultar saldos), reutilizando `PreferencesSection` y `FinancialCustomizationSection` (sin duplicar la lógica de monedas en uso)
- [x] T033 [US3] Componer `apps/web/src/domains/profile/routes/PrivacyRoute.tsx`: `ConsentHistorySection` y, separado al final, `DangerZone` (bloque con borde destructivo); quitar de `DangerZone.tsx` cualquier dependencia de columna izquierda
- [x] T034 [US3] Correr la suite de `apps/web/src/domains/profile` hasta verde (SC-005)

**Checkpoint**: sin regresiones funcionales.

---

## Phase 6: User Story 4 — Un perfil honesto: sin controles falsos ni promesas (Priority: P2)

**Goal**: tema de 3 opciones en Preferencias, "Próximamente" solo como texto, eliminar placeholders y promesas, "Eliminar cuenta" solo en Datos y privacidad.

**Independent Test**: recorrer las 5 secciones: ningún control inerte, el tema permite Sistema, la completitud llega a 100% con correo + identidad + teléfono, y "Eliminar cuenta" aparece solo en Datos y privacidad.

### Tests for User Story 4 ⚠️

- [x] T035 [P] [US4] Ampliar `apps/web/src/domains/profile/routes/ProfileRoutes.test.tsx`: en ninguna sección hay `switch`/botón de notificaciones, exportar o respaldo; el texto "Próximamente" lista las 4 funciones; "Eliminar cuenta" solo existe en `/profile/privacy`; en `/profile/preferences` el grupo de tema tiene Claro/Oscuro/Sistema y elegir Sistema deja `useTheme().mode === "system"`; ningún texto menciona SMS
- [x] T036 [P] [US4] Borrar `apps/web/src/domains/profile/components/placeholders.test.tsx` y `AccountStatusSection.test.tsx` (lo que cubrían lo reemplazan T009/T010/T035)

### Implementation for User Story 4

- [x] T037 [US4] En `apps/web/src/domains/profile/components/PreferencesSection.tsx`: reemplazar el `Switch` "Tema oscuro" por `ThemeSegmented`
- [x] T038 [US4] Crear `apps/web/src/domains/profile/components/ComingSoonNote.tsx` (texto "Próximamente: notificaciones, exportar movimientos, respaldo automático y foto de perfil", sin controles) y montarlo bajo `ProfileSectionNav` en las dos formas de `ProfileLayout.tsx`
- [x] T039 [US4] Borrar `NotificationsSection.tsx`, `DataPrivacySection.tsx`, `AccountStatusSection.tsx` y `ProfileCard.tsx` (y `ProfileCard.test.tsx`, cubierto por `ProfileIdentity.test.tsx`) de `apps/web/src/domains/profile/components/`; verificar con `grep` que nada los importa
- [x] T040 [US4] En `apps/web/src/i18n/es.json` y `en.json`: borrar `profile.notifications.*`, `profile.dataPrivacy.*`, `profile.accountStatus.*`, `profile.preferences.darkTheme` y `profile.plan.*` si queda sin uso; agregar `profile.comingSoon.list`; correr `src/i18n/parity.test.ts` hasta verde

**Checkpoint**: las cuatro historias completas.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [x] T041 [P] Revisar accesibilidad en `apps/web/src/domains/profile/**`: un solo `h1` por pantalla, foco al `h1` al cambiar de sección (como `LandingLayout`), áreas táctiles ≥ 44 px en la forma angosta, `aria-current` en la navegación, `aria-label` en "volver"
- [x] T042 [P] Verificar tema claro y oscuro (solo tokens, sin hex) en los componentes nuevos de `apps/web/src/domains/profile/components/` y `apps/web/src/shared/ui/theme-segmented.tsx`
- [x] T043 Correr las verificaciones de quickstart.md: `vitest` (profile, shared/ui, i18n, landing), `tsc --noEmit`, `eslint`, `prettier --check`, `pnpm --filter @finance/web build`
- [x] T044 Memory sync: actualizar `CLAUDE.md` (amendment de Perfil: rutas `/profile/*`, `ProfileLayout` por ancho de contenedor, `PROFILE_PANES_MIN_WIDTH`, `profileStatus.ts`, `ThemeSegmented`, placeholders eliminados; corregir menciones obsoletas de `PlanBillingSection`/`DataPrivacySection`/`AccountStatusSection`) y `.specify/memory/constitution.md` (Sync Impact Report + bump PATCH: convención de rutas por sección y forma por contenedor; además corregir el texto obsoleto del Principio III, que todavía nombra `messages/*.json` y `@/i18n/navigation` de la app Next.js antigua, por `apps/web/src/i18n/{es,en}.json` y la paridad verificada por `i18n/parity.test.ts`)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: sin dependencias; T001–T003 en paralelo.
- **Foundational (Phase 2)**: depende de Setup; bloquea todas las historias.
- **US1 (Phase 3)** y **US2 (Phase 4)**: ambas P1, dependen de Phase 2. US2 usa `ProfileSummary` (T015, con `showQuickSettings={false}`) en la vista inicial angosta, así que T026 va después de T015.
- **US3 (Phase 5)**: depende de Phase 2; puede ir en paralelo con US1/US2 salvo en `PersonalInfoSection.tsx` (T017, T027, T031 tocan el mismo archivo: en ese orden).
- **US4 (Phase 6)**: depende de T013 (`ThemeSegmented`) y de T026 (layout, para montar `ComingSoonNote`).
- **Polish (Phase 7)**: al final.

### Within Each User Story

- Tests primero (fallan) → lógica pura → componentes → integración en rutas → i18n → tests en verde.

### Parallel Opportunities

- Phase 1: T001, T002, T003.
- US1: T009, T010, T011 en paralelo; T013 en paralelo con T012/T014.
- US2: T020, T021, T022 en paralelo; T024 en paralelo con T023.
- US3: T029, T030 en paralelo.
- US4: T035, T036 en paralelo.

---

## Parallel Example: User Story 1

```text
Task: "T009 profileStatus.test.ts (etapas, siguiente paso, completitud, sesiones)"
Task: "T010 ProfileSummary.test.tsx"
Task: "T011 ProfileRoutes.test.tsx — acciones del Resumen"
```

---

## Implementation Strategy

### MVP First

1. Phase 1 + Phase 2 (rutas y layout mínimo).
2. Phase 3 (US1): Resumen funcional → validar el Independent Test de US1.
3. Phase 4 (US2): estructura de dos paneles/lista → MVP completo (las dos historias P1).

### Incremental Delivery

4. Phase 5 (US3): sin regresiones.
5. Phase 6 (US4): limpieza y honestidad.
6. Phase 7: pulido, verificaciones y memory sync.
