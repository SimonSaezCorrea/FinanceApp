# Phase 0 Research: Renombrar passkeys y autocompletado condicional

## Decision 1: `renameOwned` es un método nuevo del puerto, no una reutilización de otro

**Decisión**: agregar `renameOwned(userId: string, id: string, name: string): Promise<PasskeyProps |
null>` a `PasskeyRepositoryPort` — devuelve `null` si la fila no existe o no pertenece al usuario
(mismo contrato de retorno que `findByIdOwned`), para que el handler distinga "no encontrado" sin una
consulta aparte.

**Rationale**: los métodos existentes no sirven — `deleteOwned` borra, `updateCounterAndLastUsedWithTx`
solo toca `counter`/`lastUsedAt` (y requiere una transacción que renombrar no necesita, es una sola
fila sin invariante cruzada), `createWithTx` es de alta. `findByIdOwned` + un `save` separado
duplicaría la consulta de ownership; un método dedicado que combine "verificar dueño y actualizar"
en una sola sentencia (`UPDATE ... WHERE id = ? AND userId = ?`, retornando la fila si `count > 0`)
es más simple y evita una condición de carrera entre verificar y escribir.

**Alternatives considered**: reutilizar `findByIdOwned` (lectura) + un método genérico `save` —
rechazado, no existe un `save` genérico en este puerto (todas sus escrituras son explícitas por
operación, ej. `deleteOwned`), y agregar uno de propósito general para un solo caso de uso sería una
abstracción prematura.

## Decision 2: `RenamePasskeyHandler` es un command handler simple, sin transacción propia

**Decisión**: `RenamePasskeyCommand(userId, passkeyId, name)` → `RenamePasskeyHandler extends
BaseCommandHandler<RenamePasskeyCommand, auth.Passkey, null>`, mismo shape que
`RemovePasskeyHandler` (`loadContext` devuelve `null`, `handle` hace todo el trabajo llamando
directo al puerto, sin `persist()` propio ya que el puerto ya escribió).

**Rationale**: renombrar una llave es una operación de una sola tabla sin invariante cruzada con
otro agregado — no hay razón para envolver nada en `prisma.$transaction` (a diferencia de
`ChangePasswordHandler`/`DisableMfaHandler`, que sí lo necesitan porque tocan `Session` a la vez,
specs/024). Mismo patrón que `RemovePasskeyHandler` ya establece para este mismo dominio.

**Alternatives considered**: ninguna — es el patrón directo a espejar, sin ambigüedad real.

## Decision 3: el endpoint va DESPUÉS de `DELETE .../:id` en el controller, mismo `passkeyIdParamsSchema`

**Decisión**: `PATCH /auth/me/passkeys/:id` reutiliza `passkeyIdParamsSchema` (ya definido, `z.object({
id: rowId })`) para el path param, y un `renamePasskeyRequestSchema` nuevo (`z.object({ name:
z.string().trim().min(1).max(60) })`, MISMA validación que `confirmPasskeyRegistrationRequestSchema.
name`) para el body.

**Rationale**: no hay razón para una validación distinta al nombre inicial — mismo límite, mismo
propósito (un texto corto que el usuario reconoce). Reutilizar el schema de path param existente
evita duplicar la validación de formato UUID v7.

## Decision 4: la UI de renombrar es edición inline por fila, no un modal aparte

**Decisión**: en `PasskeySection.tsx`, cada fila de la lista gana un botón "lápiz" (ícono `Pencil` de
lucide-react, junto al `Trash2` ya existente) que convierte esa fila en un modo de edición — el
nombre se reemplaza por un `<input>` con botones de guardar (check)/cancelar (x), sin abrir ningún
`Modal`/`ConfirmModal` nuevo.

**Rationale**: renombrar no es una acción destructiva (no necesita la fricción de una confirmación
aparte, a diferencia de "Eliminar llave", que sí usa `ConfirmModal`) — es una edición de texto rápida,
mejor servida in-place. El propio `SidePanel` que contiene la lista ya es la única superficie
necesaria; agregar un segundo overlay encima sería fricción de más para un cambio de un campo.

**Alternatives considered**: un `ConfirmModal`/`SidePanel` dedicado igual que "Agregar llave" — se
descartó por ser desproporcionado para cambiar un solo campo de texto ya visible en la lista.

## Decision 5: autocompletado condicional — feature-detectado, con `AbortController` propio

**Decisión**: en `LoginRoute.tsx`, un `useEffect` al montar la pantalla:

1. Verifica `window.PublicKeyCredential?.isConditionalMediationAvailable` existe Y resuelve `true` —
   si no, no hace nada (ningún error, ninguna llamada).
2. Si está disponible, pide las opciones de login discoverable al backend (`passkeyApi.startLogin({})`,
   SIN email — el mismo camino que ya usa el botón explícito cuando el campo está vacío) y llama
   `navigator.credentials.get({ mediation: "conditional", publicKey: options, signal:
abortController.signal })`.
3. Si el usuario completa la ceremonia (elige la sugerencia), se verifica exactamente igual que hoy
   (`passkeyApi.verifyLogin`) y navega — mismo código que ya usa `loginWithPasskey`.
4. El `AbortController` se cancela (`abort()`) en el cleanup del `useEffect` (desmontar la pantalla) Y
   justo antes de que el usuario envíe el formulario de contraseña — un `get()` condicional pendiente
   nunca debe competir con un login por contraseña en curso.

**Rationale**: `isConditionalMediationAvailable()` es la forma estándar de feature-detectar esto (FR-007:
"navegador sin soporte... no debe mostrar ningún error"); llamar `get()` sin detectar soporte primero
funciona igual en navegadores compatibles pero puede comportarse de forma inconsistente en los que no
(algunos ignoran `mediation` silenciosamente, otros no) — la detección explícita es la práctica
recomendada por la propia especificación WebAuthn L3. El `AbortController` es obligatorio por spec:
un segundo `get()` sin abortar el primero lanza `InvalidStateError` — y el login por contraseña puede
ocurrir en cualquier momento mientras la sugerencia condicional sigue "escuchando".

**Alternatives considered**: disparar el `get()` condicional solo al hacer focus explícito del campo
(vía `onFocus`) en vez de al montar — rechazado: la especificación de conditional UI está diseñada
para que el navegador decida CUÁNDO mostrar la sugerencia (típicamente cuando el campo asociado recibe
foco), pero la promesa de JS se establece UNA vez al cargar la página, no en cada focus — intentar
re-lanzarla en cada `onFocus` competiría consigo misma y violaría el mismo invariante de "un `get()` a
la vez" que el `AbortController` existe para proteger.

## Verificación de compatibilidad de navegador (nota, no bloqueante)

Chrome/Edge (109+) y Safari (16+) soportan `mediation: "conditional"`; Firefox no lo soporta a la
fecha de este plan — cae directo al camino "no disponible" de Decision 5, sin degradar el botón
explícito existente (FR-007). No se agrega ningún mensaje ni indicador de compatibilidad — la
ausencia de la sugerencia es silenciosa por diseño.
