# Quickstart: validar que reintentar no duplica dinero

**Feature**: 015-idempotent-money-writes

Guía de validación manual. Los detalles de diseño están en [data-model.md](./data-model.md) y
[contracts/idempotency.md](./contracts/idempotency.md).

## Prerrequisitos

```bash
pnpm install
pnpm --filter @finance/api exec prisma generate
pnpm db:reset          # requiere Docker; recrea la base y siembra datos de demo
pnpm dev
```

Login de demo: `test@finance.local` / `demo1234`. La API queda en
`http://localhost:3001/api/v1`, la web en `http://localhost:5173`.

Para los escenarios de `curl`, primero guardá la cookie de sesión:

```bash
curl -s -c /tmp/fa.jar -X POST http://localhost:3001/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"test@finance.local","password":"demo1234"}'
```

Anotá el id de una cuenta con saldo: `curl -s -b /tmp/fa.jar http://localhost:3001/api/v1/accounts`.

---

## 1. El caso central: el mismo intento, dos veces (US1, FR-003, SC-001)

Mandá **la misma petición con la misma clave** dos veces:

```bash
KEY=$(uuidgen)
for i in 1 2; do
  curl -s -b /tmp/fa.jar -X POST http://localhost:3001/api/v1/transactions \
    -H 'Content-Type: application/json' \
    -H "Idempotency-Key: $KEY" \
    -d '{"type":"EXPENSE","amount":"12000","currency":"CLP",
         "occurredAt":"2026-09-02T12:00:00.000Z","bankAccountId":"<ID>",
         "description":"Café"}'
  echo
done
```

**Esperado**: las dos respuestas son **idénticas**, mismo `id` incluido. En `GET /transactions` hay
**un** movimiento de 12.000 y el saldo de la cuenta bajó **12.000, no 24.000**.

## 2. Dos operaciones distintas que se parecen (FR-002, SC-003 — el caso que no debe romperse)

Lo mismo, pero **una clave nueva** en cada envío:

```bash
for i in 1 2; do
  curl -s -b /tmp/fa.jar -X POST http://localhost:3001/api/v1/transactions \
    -H 'Content-Type: application/json' \
    -H "Idempotency-Key: $(uuidgen)" \
    -d '<el MISMO body del escenario 1>'
  echo
done
```

**Esperado**: **dos** movimientos, con ids distintos, y el saldo baja dos veces. Sin advertencia, sin
confirmación. Si este escenario falla, la feature está mal implementada aunque el escenario 1 pase.

## 3. Misma clave, datos distintos (FR-005)

Reusá la `$KEY` del escenario 1 cambiando el monto a `"99999"`.

**Esperado**: `409` con `{"error":{"code":"IDEMPOTENCY_KEY_REUSED"}}`, y **ningún** movimiento nuevo.

## 4. Un intento rechazado no deja trabado al usuario (FR-004)

Con una clave nueva, mandá un gasto con tarjeta de crédito por encima del cupo.

**Esperado**: `CARD_LIMIT_EXCEEDED`. Después, **con la misma clave**, mandá un monto que sí entre.

**Esperado**: se registra normalmente. Un intento rechazado se olvida.

## 5. Dos envíos simultáneos (FR-006, SC-007 — no es lo mismo que el escenario 1)

```bash
KEY=$(uuidgen)
for i in 1 2; do
  curl -s -b /tmp/fa.jar -X POST http://localhost:3001/api/v1/transactions \
    -H 'Content-Type: application/json' -H "Idempotency-Key: $KEY" \
    -d '<body>' &
done; wait
```

**Esperado**: uno responde `201`; el otro responde `201` con el mismo cuerpo, o `409
IDEMPOTENCY_IN_PROGRESS`. **Nunca dos movimientos.** Repetilo unas diez veces: la carrera no siempre
se gana igual.

## 6. Falta el header (contrato)

Misma petición sin `Idempotency-Key`.

**Esperado**: `400 IDEMPOTENCY_KEY_REQUIRED`. Ningún movimiento.

## 7. El preflight de CORS acepta el header (verificación explícita)

`main.ts` habilita CORS sin lista de `allowedHeaders`, así que el middleware debería reflejar el
header pedido. **Confirmalo de verdad** — si esto falla, el navegador rompe y `curl` no lo mostraría:

```bash
curl -s -i -X OPTIONS http://localhost:3001/api/v1/transactions \
  -H 'Origin: http://localhost:5173' \
  -H 'Access-Control-Request-Method: POST' \
  -H 'Access-Control-Request-Headers: idempotency-key,content-type'
```

**Esperado**: `204`, y `Access-Control-Allow-Headers` incluye `idempotency-key`.

## 8. Doble clic en el pago de una cuota de deuda (US2)

En la web, Deudas → registrar un pago haciendo **doble clic rápido** sobre el botón.

**Esperado**: `paidInstallments` sube **uno**. El botón queda deshabilitado mientras la petición está
en vuelo (hoy no lo está: `ActionBtn` no acepta `disabled`).

## 9. Doble envío de un plan de cuotas con tarjeta de crédito (US2 — el de mayor monto)

Crear un plan de 500.000 en 10 cuotas con una tarjeta CREDIT, enviando dos veces con la misma clave.

**Esperado**: **un** plan, **un** calendario de 10 cuotas, y el cupo consumido de la cuenta sube
**500.000, no 1.000.000**. Comprobalo en el detalle de la cuenta de crédito.

## 10. Liquidar una deuda dos veces no mueve la fecha (research §9.1)

`POST /debts/:id/settle` sobre una deuda ya liquidada, con **clave nueva** (no es un reintento: es
una acción nueva sobre un estado terminal).

**Esperado**: `409 DEBT_ALREADY_SETTLED`, y `settledAt` **sin cambios**. Hoy se re-estampa con la
fecha de hoy.

## 11. Corregir un aporte a una meta de ahorro (US3, FR-012)

```bash
ENTRY=$(curl -s -b /tmp/fa.jar -X POST http://localhost:3001/api/v1/savings/entries \
  -H 'Content-Type: application/json' -H "Idempotency-Key: $(uuidgen)" \
  -d '{"amount":"200000","currency":"CLP","contributedAt":"2026-09-02T12:00:00.000Z"}' \
  | python -c 'import sys,json; print(json.load(sys.stdin)["id"])')

curl -s -b /tmp/fa.jar -X PATCH http://localhost:3001/api/v1/savings/entries/$ENTRY \
  -H 'Content-Type: application/json' -d '{"amount":"150000"}'

curl -s -b /tmp/fa.jar -X DELETE -o /dev/null -w '%{http_code}\n' \
  http://localhost:3001/api/v1/savings/entries/$ENTRY
```

**Esperado**: el `PATCH` devuelve el aporte con `amount: "150000"`; el `DELETE` responde `204`; el
aporte desaparece de `GET /savings/entries`. Un segundo `DELETE` responde `404`.

## 12. Un aporte ajeno no existe (principio II)

Con la sesión de `test@finance.local`, pedí el id de un aporte de `demo@finance.local`.

**Esperado**: `404 SAVINGS_ENTRY_NOT_FOUND`. **Nunca 403** — la API no confirma que el dato de otro
exista.

## 13. El replay silencioso de la propia app (SC-004)

El escenario más difícil de reproducir a mano y el más valioso. En la web, con las devtools:

1. Poné el `JWT_ACCESS_EXPIRES` en `10s` en `apps/api/.env` y reiniciá la API.
2. Abrí el formulario de movimiento, esperá a que el access token venza, y guardá.
3. La petición da `401`, `apiClient` renueva la sesión y **reenvía la original**.

**Esperado**: **un** movimiento. Antes de esta feature, ese camino podía crear dos.

## 14. El límite conocido: recargar la página (documentado, no arreglado)

Abrí el formulario, guardá, y **recargá la página** antes de que responda. Volvé a cargar el
formulario con los mismos datos y guardá.

**Esperado**: **dos** movimientos. Es correcto según el diseño — el ref con la clave se perdió, así
que es un intento nuevo. Está en Out of Scope de la spec; el escenario existe para que quede
verificado como límite conocido y no se descubra como sorpresa.

## 15. El saldo cuadra después de una tanda de reintentos (SC-006)

El escenario que verifica la invariante contable de la app entera, no una operación suelta.

1. Anotá el saldo inicial de una cuenta y la suma de sus movimientos.
2. Registrá 5 movimientos, **reintentando cada uno tres veces con su misma clave**, y mezclando dos
   pares de movimientos genuinamente distintos pero idénticos en sus datos.
3. Registrá un traspaso hacia otra cuenta, también reintentado.

```bash
curl -s -b /tmp/fa.jar 'http://localhost:3001/api/v1/transactions?bankAccountId=<ID>' \
  | python -c 'import sys,json;d=json.load(sys.stdin)["items"];print(len(d))'
curl -s -b /tmp/fa.jar http://localhost:3001/api/v1/accounts \
  | python -c 'import sys,json;print([a["currentBalance"] for a in json.load(sys.stdin) if a["id"]=="<ID>"])'
```

**Esperado**: hay **7** movimientos (5 + 2 duplicados legítimos), no 21, y
`currentBalance == initialBalance + Σingresos − Σgastos`. Si esta cuenta no cuadra, nada de lo
anterior importa.

## 16. Un fallo a mitad de camino no deja el intento marcado como aplicado (FR-015)

La invariante de la que depende todo el diseño ([research.md](./research.md) §3). No se puede
provocar a mano de forma confiable — **existe como test de integración**, y acá se describe qué debe
demostrar:

Forzar que el efecto falle **después** de que el intento quedó reservado (por ejemplo, haciendo que
el `INSERT` del movimiento viole una restricción dentro de la transacción).

**Esperado**: no queda movimiento, no queda saldo movido, y el registro del intento **no** queda en
`COMPLETED`. Un reintento posterior con la misma clave se procesa como un intento nuevo, no devuelve
una respuesta guardada que nunca ocurrió.

---

## Gates automáticos

```bash
pnpm --filter @finance/api test:unit          # sin una sola conexión a base de datos
pnpm --filter @finance/api test:integration   # incluye la carrera del escenario 5 contra Postgres real
pnpm --filter @finance/api test:e2e
pnpm typecheck && pnpm check:boundaries && pnpm test
```

Los escenarios **5** y **16** deben existir como tests de integración, no sólo como pasos manuales:
son las únicas garantías de FR-006 y FR-015 respectivamente, y ninguna de las dos se puede verificar
con puertos falsos.
