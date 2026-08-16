# Catálogo regional — investigación conservada

Este documento guarda el trabajo de catálogo que **salió del seed al acotar el MVP a Chile**
(2026-08-15) y las reglas de mercado que lo acompañan. Nada de esto es código muerto por accidente:
el modelo sigue siendo multi-país (FK `Country`, filtro `?country=`, `InstitutionKind`,
`accountNumberFormat`/`isValidCbu` en `@finance/contracts`); lo que se redujo es **la data
sembrada**, porque un selector de país que ofrece mercados sin bancos es peor que no ofrecerlos.

Fuente exacta de lo eliminado: commit `2df6f71` y anteriores (`apps/api/prisma/seed.ts`,
función `seedArgentina` y las listas `COUNTRIES` / `CURRENCIES` / `LINKS` / `IDENTIFIER_LINKS`).
Restaurar cualquier bloque es copiarlo de vuelta desde ahí.

---

## 1. Países que estaban sembrados

| alpha2 | alpha3 | numérico | Nombre      | Prefijo |
| ------ | ------ | -------- | ----------- | ------- |
| CL     | CHL    | 152      | Chile       | +56     |
| AR     | ARG    | 032      | Argentina   | +54     |
| CO     | COL    | 170      | Colombia    | +57     |
| PY     | PRY    | 600      | Paraguay    | +595    |
| PE     | PER    | 604      | Perú        | +51     |
| PR     | PRI    | 630      | Puerto Rico | +1      |

Solo Chile y Argentina llegaron a tener instituciones. Colombia, Perú, Paraguay y Puerto Rico
aparecían en el selector devolviendo cero bancos.

## 2. Argentina — catálogo completo (retirado del seed)

**Llave natural = código de entidad BCRA**, que son los **3 primeros dígitos de todo CBU** emitido
por esa entidad. Por eso es la llave correcta y no un número inventado.

| code            | Marca           | Razón social                               | kind             | Productos                    |
| --------------- | --------------- | ------------------------------------------ | ---------------- | ---------------------------- |
| 011             | Banco Nación    | Banco de la Nación Argentina               | BANK             | SAVINGS/CHECKING/CREDIT_CARD |
| 007             | Banco Galicia   | Banco de Galicia y Buenos Aires S.A.U.     | BANK             | idem                         |
| 014             | Banco Provincia | Banco de la Provincia de Buenos Aires      | BANK             | idem                         |
| 017             | BBVA            | BBVA Argentina S.A.                        | BANK             | idem                         |
| 029             | Banco Ciudad    | Banco de la Ciudad de Buenos Aires         | BANK             | idem                         |
| 072             | Santander       | Banco Santander Argentina S.A.             | BANK             | idem                         |
| 143             | Brubank         | Brubank S.A.U.                             | BANK             | SAVINGS/CREDIT_CARD          |
| 191             | Credicoop       | Banco Credicoop Coop. Ltdo.                | BANK             | idem bancos                  |
| 285             | Banco Macro     | Banco Macro S.A.                           | BANK             | idem bancos                  |
| PSP-mercadopago | Mercado Pago    | Mercado Pago S.R.L.                        | PAYMENT_PROVIDER | SIGHT/PREPAID                |
| PSP-uala        | Ualá            | Wanap S.A.                                 | PAYMENT_PROVIDER | SIGHT/PREPAID                |
| PSP-personalpay | Personal Pay    | Micro Sistemas S.A.U.                      | PAYMENT_PROVIDER | SIGHT/PREPAID                |
| PSP-naranjax    | Naranja X       | Naranja Digital Compañía Financiera S.A.U. | PAYMENT_PROVIDER | SIGHT/PREPAID/CREDIT_CARD    |

Notas de mercado que costaron investigación:

- **La caja de ahorro (`SAVINGS`) es la cuenta cotidiana argentina**; la cuenta corriente es más
  bien producto de empresa. Al revés que en Chile.
- Los **PSP** van keyed `PSP-<slug>` porque sus **prefijos CVU no están publicados** en las fuentes
  usadas — la misma honestidad que las AGF chilenas (`AGF-<slug>`): antes que inventar un código de
  regulador, decir que la llave es interna.
- `InstitutionKind.PAYMENT_PROVIDER` nació para ellos: mantiene cuentas de pago (dinero electrónico)
  sin ser banco y sin que el producto sea una tarjeta. **Es la misma figura** de las **SEDPE**
  colombianas, las **EEDE** peruanas y las **EMPE** paraguayas — un rol, cuatro nombres
  regulatorios. Hoy en Chile lo usa Fintual Prepago.

## 3. Formatos de número de cuenta por mercado

Vive en `packages/contracts/src/accounts/account-number.ts` y **sigue en el código** (no se borró).

- `accountNumberFormat(alpha2)` — qué formato usa el mercado.
- `usesAccountAlias(alpha2)` — si además se identifica por **alias** (`mate.tango.mp`), guardado en
  `BankAccount.accountAlias`; null donde no aplica.
- **`isValidCbu`** — 22 dígitos en dos bloques, **cada uno con su propio dígito verificador**;
  ponderaciones `7,1,3,9,7,1,3` y `3,9,7,1,3,9,7,1,3,9,7,1,3`. El mismo validador sirve para **CVU**
  (mismo esquema), que es justamente el punto del diseño.
- **Chile queda como texto libre a propósito**: no hay formato único ni dígito verificador de cuenta.
- **Permisivo por defecto**: un país sin formato conocido acepta cualquier número. La regla es no
  bloquear una cuenta real por no conocer su mercado.
- Validación de dos lados: agregado (`BankAccount.assertAccountIdentifiers`, errores
  `INVALID_ACCOUNT_NUMBER` / `INVALID_ACCOUNT_ALIAS`) y formularios web con la misma función del
  contrato. Mostrar el error y guardar igual sería peor que no validar.

## 4. Tipos de identificación por país

Tabla `country-identifier-type` (`CountryIdentifierType`, espeja a `CountryCurrency`). Un país puede
soportar **más de uno** (documento nacional + pasaporte), por eso es join y no un escalar.

| País | Tipos (primario primero) |
| ---- | ------------------------ |
| CL   | RUT, PASSPORT            |
| AR   | DNI, PASSPORT            |
| CO   | DNI, PASSPORT            |
| PY   | DNI, PASSPORT            |
| PE   | DNI, PASSPORT            |
| PR   | PASSPORT, OTHER          |

`identifierValue` se valida con dígito verificador **solo para RUT** (`isValidRut`, módulo 11): los
otros tipos no tienen un formato universal que validar. El formulario web deriva las opciones del
país elegido, no de una lista fija.

## 5. Monedas

El seed tenía las **168 monedas ISO 4217** (código alfabético + numérico + nombre en español). El
MVP dejó tres: `CLP`, `CLF` (Unidad de Fomento) y `USD`. La lista completa está en el commit
`2df6f71` (`CURRENCIES` en `seed.ts`) y se restaura pegándola de vuelta.

Enlaces país ↔ moneda que existían (`CountryCurrency`, `isPrimary` = principal):

| País | Monedas             |
| ---- | ------------------- |
| CL   | CLP (primaria), CLF |
| AR   | ARS                 |
| CO   | COP, COU            |
| PY   | PYG                 |
| PE   | PEN                 |
| PR   | USD                 |

Notas:

- **`CLF` es el código ISO 4217 de la UF.** La UF es una unidad de cuenta reajustable, no una moneda
  gastable; esta app **no la convierte a pesos** (no hay proveedor de tipo de cambio), así que un
  monto en UF se guarda y se muestra en UF.
- `COU` es la Unidad de Valor Real colombiana: el mismo concepto que la UF, y la razón por la que el
  modelo acepta más de una moneda por país.
- La app **nunca suma monedas distintas**: los totales van agrupados por moneda. Los "≈ CLP" que se
  muestran junto a montos extranjeros salen de tasas estáticas escritas a mano en
  `apps/web/src/shared/lib/fx.ts`, jamás de una conversión persistida.

## 6. Reglas de catálogo que valen para cualquier mercado

Estas son las conclusiones transferibles — lo que hay que respetar cuando se vuelva a expandir:

1. **Una licencia es un permiso, no un producto.** Fintual tiene licencia de prepago y nunca emitió
   tarjetas; su fila es `PAYMENT_PROVIDER`. El registro dice qué PUEDE hacer una entidad; el
   catálogo debe decir qué VENDE.
2. **`kind` es lo que la entidad ES (regulación); `institution-account-type` es lo que VENDE.** No
   se deriva uno del otro. Una entidad puede tener dos licencias y seguir siendo una fila.
3. **El catálogo es permisivo**: una institución sin productos catalogados se ofrece para todo tipo
   de cuenta. Siempre va atrasado respecto de la realidad, y una fila faltante nunca debe esconder un
   banco real. El filtro guía el selector, jamás rechaza un `POST /accounts`.
4. **Un selector vacío es hueco de catálogo hasta probar lo contrario** — la permisividad solo
   rescata a la institución con CERO filas, no a la que declara otros productos.
5. **Marca vs. razón social**: `name` es la marca que la persona reconoce, `legalName` la del
   registro, y el buscador consulta ambas más `brands`.
6. **Llave natural o llave declaradamente interna**: código de transferencia si existe (SBIF/CMF,
   BCRA), y si no, un prefijo que lo diga en voz alta (`RUT-`, `PSP-`, `AGF-`). Nunca un número
   inventado con pinta de oficial.
7. **Re-llavear una entidad exige retirar la llave vieja explícitamente** (`RETIRED_ISSUER_KEYS`), o
   el upsert crea la fila nueva y deja huérfana la anterior.
