# Consentimiento y avisos en el punto de captura — FinanceApp

> Art. 12 de la Ley 21.719: el consentimiento debe ser **previo, libre, específico, informado e
> inequívoco**, mediante un **acto afirmativo** (casilla NO premarcada), y **revocable** por un medio
> expedito, gratuito y permanente.

> ⚠️ **Estado real hoy: ❌ no implementado.** `apps/web/src/domains/auth` (registro/login) no tiene ningún checkbox de consentimiento ni enlace a política de privacidad — verificado por grep, cero coincidencias de "terms/consent/acepto". Este texto está listo para integrarse al formulario de registro (`RegisterRoute`).

## 1. Aviso corto (en el punto de captura, junto al formulario de registro)
> Tus datos (nombre, correo, teléfono, RUT) los trata FinanceApp para crear y administrar tu cuenta. Puedes ejercer tus derechos en simon.alejandro.saez@gmail.com. Más detalles en nuestra [Política de Privacidad](/legal/privacidad).

## 2. Consentimiento general (checkbox, NO premarcado)
> ☐ Acepto que FinanceApp trate mis datos para crear y administrar mi cuenta, según su [Política de Privacidad](/legal/privacidad).

FinanceApp no envía marketing hoy (no hay proveedor de correo integrado), así que no aplica un segundo checkbox de marketing por ahora.

## 3. Datos financieros sensibles (Art. 16 — consentimiento reforzado)
Este es el checkbox **crítico** para FinanceApp, dado que registrar saldos/movimientos/deudas es tratar tu "situación socioeconómica" (dato sensible, Art. 2 letra g):

> ☐ Autorizo expresamente a FinanceApp a tratar mis datos financieros (cuentas, saldos, movimientos, tarjetas, deudas, ahorros) para prestarme el servicio de gestión financiera personal, según su [Política de Privacidad](/legal/privacidad).

Debe presentarse **separado** del checkbox general (2), con su propio acto afirmativo — no se puede inferir de "aceptar los términos" en general.

## 4. Revocación
Hoy no existe un botón "retirar consentimiento" independiente — la única acción disponible es `POST /auth/me/deactivate`, que desactiva la cuenta pero no revoca específicamente el consentimiento de datos sensibles ni borra los datos. Recomendación: agregar en Perfil → Privacidad un control explícito de revocación.

## 5. Registro del consentimiento (prueba)
> ⚠️ **No implementado.** No existe hoy ninguna columna en `User` (`apps/api/prisma/schema.prisma`) que registre qué se aceptó, cuándo, ni la versión de política vigente al momento del registro. La carga de la prueba del consentimiento es del responsable (Art. 12) — sin este registro, FinanceApp no podría demostrar que un usuario consintió si se lo exige la Agencia.

**Remediación sugerida** (ver `references/build/` de la skill): agregar `User.privacyConsentAt` / `User.financialConsentAt` (timestamp) + `User.consentPolicyVersion`, poblados al registrar los checkboxes de la sección 2 y 3.

---
*Borrador generado con compliance-cl (pack ley-21719). No constituye asesoría legal; revisar con un abogado.*
