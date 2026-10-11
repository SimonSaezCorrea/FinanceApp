# Consentimiento y avisos en el punto de captura — fik

> Art. 12 de la Ley 21.719: el consentimiento debe ser **previo, libre, específico, informado e
> inequívoco**, mediante un **acto afirmativo** (casilla NO premarcada), y **revocable** por un medio
> expedito, gratuito y permanente. Actualizado el 2026-10-11 con el estado real.

## 1. Estado: ✅ implementado (desde 2026-09-20)

- **Formulario de registro** (`apps/landing/src/domains/auth/components/RegisterForm.tsx`, panel de
  acceso del sitio público): una casilla **no premarcada** "Datos sensibles" con el texto _"Acepto que
  fik trate mis datos financieros (saldos, movimientos, deudas) como dato sensible, según la Política
  de Privacidad"_, que enlaza a la política publicada (`/es/privacy-policy/`, en una pestaña nueva
  para no perder el formulario).
- **Sin la casilla no hay registro:** el contrato exige `sensitiveDataConsent: true`
  (`registerRequestSchema`, `z.literal(true)`); el API rechaza el registro si falta.
- **Menores de 18:** además, el registro exige la autorización del tutor (nombre, RUT, parentesco y su
  propia casilla), registrada como un segundo consentimiento.

## 2. Registro del consentimiento (prueba): ✅

Cada consentimiento es una fila `ConsentRecord` (tabla `consent-record`):

- `type`: `SENSITIVE_DATA_PROCESSING`, y `MINOR_GUARDIAN_AUTHORIZATION` cuando aplica.
- `policyVersion`: fijada por el servidor (`CURRENT_PRIVACY_POLICY_VERSION`,
  `apps/api/src/domains/user/application/privacy-policy-version.ts`), nunca por el cliente.
  **"2026-10-11"** desde la publicación de la política; los registros anteriores dicen "2026-09-20".
  Subirla a mano cada vez que la política o el texto del consentimiento cambien de forma relevante.
- Fecha y hora; para el tutor, nombre y parentesco en claro y su RUT solo como HMAC.
- El titular ve su historial en Perfil → Datos y privacidad (`GET /auth/me/consents`).

## 3. Consentimiento general y marketing

No hay casilla separada de "términos generales": el tratamiento de los datos de cuenta se basa en la
ejecución del contrato. **No se envía marketing**: los únicos correos son los de cuenta y de seguridad
(Resend), que no requieren consentimiento aparte. Si algún día se envía marketing, hará falta una
casilla propia, separada y opcional.

## 4. Revocación

El consentimiento para datos financieros es la condición del servicio: revocarlo equivale a eliminar
la cuenta (Perfil → Datos y privacidad → Eliminar cuenta, gratuito y permanente). No hay un botón de
"retirar consentimiento" separado porque no existiría un servicio que prestar sin esos datos. Una
revocación pedida por correo se atiende igual (ver `21719-canal-derechos.md`).

---

_Borrador generado con compliance-cl (pack ley-21719), actualizado a mano el 2026-10-11. No constituye
asesoría legal._
