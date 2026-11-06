# Research: Verificar el autenticador de las llaves de acceso (041)

## R1 — Librería: `@simplewebauthn/server` 13.3 ya trae lo pesado

- **Decision**: usar lo que la dependencia existente ya incluye, sin dependencias nuevas:
  - `verifyMDSBlob(blob)` (exportado por `@simplewebauthn/server/helpers`) verifica la firma del
    catálogo (JWT con cadena x5c hasta la raíz de la FIDO Alliance, con chequeo de revocación de
    certificados) y devuelve `payload` (con `no`, `nextUpdate` y `entries[]`, cada una con `aaguid`,
    `metadataStatement` y `statusReports`).
  - `MetadataService.initialize({ statements, mdsServers: [], verificationMode: "permissive" })` carga
    declaraciones locales, sin red. `verifyRegistrationResponse` las usa solo para los formatos con
    certificado (`packed` con x5c, `tpm`, `android-key`, `android-safetynet`): busca la declaración del
    AAGUID y valida la cadena del certificado de attestation contra las raíces del fabricante.
- **Rationale**: lo que la nota de `docs/PENDING.md` llamó "integración pesada" (bajar, parsear y
  verificar el BLOB firmado) ya está hecho y probado en la librería que usamos.
- **Alternatives**: dejar que `MetadataService` baje el catálogo solo (su modo por defecto). Se descartó
  por tres razones: (1) guarda el catálogo solo en memoria (cada despliegue lo baja de nuevo y los dos
  contenedores del despliegue podrían tener copias distintas); (2) no expone los `statusReports`, solo
  lanza un error genérico para cuatro estados y no considera `REVOKED`; (3) refresca a mitad de un
  registro, con red, cuando el catálogo vence.

## R2 — El catálogo vive en una tabla propia

- **Decision**: tabla-dominio nueva **`authenticator-model`** (datos globales de referencia, sin
  `userId`, igual que `exchange-rate`): una fila por AAGUID con nombre del modelo, la declaración de
  metadatos (JSON, para cargarla en `MetadataService`), el estado de compromiso derivado de los
  `statusReports` y el número/vencimiento del catálogo del que viene. Una actualización reemplaza todo en
  una transacción, solo si el número del catálogo nuevo es mayor que el guardado (regla FIDO: ignorar un
  BLOB con número menor o igual).
- **Rationale**: sobrevive reinicios y despliegues (ambos contenedores leen la misma copia), permite que
  la revisión de llaves y el registro consulten el estado por AAGUID con una consulta indexada, y es
  auditable.
- **Alternatives**: archivo en disco (no compartido entre contenedores); memoria (se pierde en cada
  despliegue).

## R3 — Qué cuenta como "comprometido"

- **Decision**: el modelo está comprometido si el `statusReport` más reciente de su entrada es uno de
  `REVOKED`, `USER_VERIFICATION_BYPASS`, `ATTESTATION_KEY_COMPROMISE`, `USER_KEY_REMOTE_COMPROMISE` o
  `USER_KEY_PHYSICAL_COMPROMISE`. Se guarda ese estado y su fecha.
- **Rationale**: son los estados que la especificación MDS3 define como "no confiar" (los cuatro que la
  librería ya trata como comprometidos, más `REVOKED`, que la spec pide explícitamente). Se mira el más
  reciente porque un fabricante puede publicar un `UPDATE_AVAILABLE` posterior que corrige el problema
  para firmwares nuevos; pero una llave ya marcada nunca se desmarca (FR-010).
- **Alternatives**: cualquier reporte histórico de compromiso (bloquearía modelos ya corregidos).

## R4 — Cuándo una llave queda "verificada"

- **Decision**: verificada ⇔ el registro trajo attestation con certificado (formato distinto de `none`
  y `apple`, con cadena x5c, o `tpm`/`android-*`), el AAGUID no es cero, existe en `authenticator-model`
  y `verifyRegistrationResponse` la aceptó con esa declaración cargada (lo que implica que la cadena del
  certificado llega a una raíz del fabricante del catálogo). En cualquier otro caso: no verificada.
- **Rationale**: un AAGUID solo, sin certificado, lo puede inventar cualquier autenticador; sin la
  cadena hasta la raíz del catálogo no hay prueba del modelo.

## R5 — Una attestation inválida no rechaza: se trata como "none"

- **Decision**: si `verifyRegistrationResponse` falla y la respuesta traía un formato distinto de
  `none`, se reintenta una vez con el `attestationObject` reescrito a `fmt: "none"` y `attStmt: {}`
  (CBOR de `@simplewebauthn/server/helpers`). Si ese segundo intento pasa, la llave se guarda como no
  verificada; si también falla, el error es el de hoy (`PASSKEY_CHALLENGE_INVALID`).
- **Rationale**: FR-006 pide tratar una attestation no verificable como ausente. Reescribir a `none` es
  exactamente lo que habría enviado el navegador si la persona no compartía la attestation: el desafío,
  el origen, el RP y la llave pública se siguen validando en el segundo intento.
- **Alternatives**: rechazar (viola FR-006); saltar la validación de la librería (perdería las demás
  comprobaciones).

## R6 — Pedir la attestation: `attestationType: "direct"`

- **Decision**: `generateRegistrationOptions({ attestationType: "direct" })`.
- **Rationale**: es la única forma de recibir el certificado del fabricante. Las passkeys sincronizadas
  (iCloud, Google, gestores) responden `none` igual. **Efecto conocido**: con una llave física, Chrome
  puede mostrar un aviso para permitir que el sitio vea la marca y el modelo; si la persona lo rechaza,
  el navegador anonimiza la respuesta y la llave queda no verificada (spec, edge case). Las passkeys
  sincronizadas no muestran ese aviso (SC-003).

## R7 — Nombre sugerido antes de guardar

- **Decision**: endpoint nuevo `POST /auth/me/passkeys/register-suggestion` que recibe la respuesta del
  navegador (la misma que irá al confirmar), lee el AAGUID de los datos del autenticador **sin**
  verificar ni consumir el desafío, y devuelve el nombre del modelo si el AAGUID está en el catálogo. La
  web lo llama al terminar la ceremonia y precompleta el campo de nombre.
- **Rationale**: el flujo actual ya pide el nombre después de crear la credencial; basta con una
  sugerencia. Es solo una sugerencia: lo que se guarda como modelo lo decide la verificación del
  confirmar. No toca la base ni consume el desafío, así que no cambia la idempotencia del confirmar.
- **Alternatives**: hacer el nombre opcional en el confirmar y usar el modelo (no deja editar antes de
  guardar, que la spec pide).

## R8 — Carga del catálogo en `MetadataService` y concurrencia

- **Decision**: un servicio `AuthenticatorCatalog` (en `user/application`) carga las declaraciones de la
  tabla en `MetadataService` al arrancar (sin red) y después de cada actualización. Antes de verificar un
  registro, se asegura de tener cargada la versión vigente (compara el número guardado con el cargado),
  así que el otro contenedor del despliegue toma el catálogo nuevo en su siguiente registro.
- **Rationale**: `MetadataService` es un singleton en memoria; recargarlo desde la tabla es barato
  (cientos de entradas) y no usa red.

## R9 — Actualización diaria y revisión de llaves

- **Decision**: un paso nuevo, aislado, en `MaintenanceCron` (03:00, Chile): baja el BLOB de
  `https://mds3.fidoalliance.org/` (timeout 30 s), lo verifica con `verifyMDSBlob`, y si su número es
  mayor que el guardado reemplaza la tabla y recarga `MetadataService`. Luego revisa las llaves:
  `UPDATE passkey SET compromisedAt, compromisedReason WHERE verifiedAt IS NOT NULL AND compromisedAt IS
NULL AND aaguid IN (<comprometidos>) RETURNING …` — solo las que este paso marcó reciben correo y
  cierre de sesiones. Si la API arranca con la tabla vacía y los crons activos, corre la actualización
  una vez en segundo plano.
- **Rationale**: FR-007 (al menos diario), FR-017 (repetible: el `WHERE compromisedAt IS NULL` es la
  forma (a) del Principio VII). La FIDO Alliance publica el catálogo aproximadamente una vez al mes, así
  que diario es holgado. Un catálogo vencido (`nextUpdate` pasado y sin uno nuevo) se sigue usando para
  mostrar modelos, pero no marca llaves nuevas (FR-007: "solo una copia no vencida").
- **Alternatives**: cron propio (CLAUDE.md fija tres crons; la mantención ya agrupa barridos diarios).

## R10 — Cerrar las sesiones abiertas con la llave

- **Decision**: `session.passkeyId` (FK nullable a `passkey`, `onDelete: SetNull`), escrito por el login
  con llave. Al marcar una llave, en la misma transacción se cierran las sesiones abiertas con
  `passkeyId` en las marcadas (`closeByPasskeysWithTx`).
- **Rationale**: Clarificación de la spec (A). Las sesiones abiertas antes de esta feature no tienen
  `passkeyId` y no se pueden atribuir; no se tocan (consistente con "no revisar lo anterior").

## R11 — Login y step-up con una llave comprometida

- **Decision**: `VerifyPasskeyLoginHandler` y `VerifyStepUpPasskeyHandler` rechazan una llave con
  `compromisedAt` con el error nuevo **`PASSKEY_COMPROMISED`** (403). `stepUpMethodsFor` recibe la
  cantidad de llaves **usables** (no comprometidas), así que una cuenta cuya única llave está comprometida
  vuelve a confirmar con contraseña (o su segundo factor).
- **Rationale**: FR-009 pide un mensaje claro. No filtra información: quien presenta la llave la tiene.

## R12 — Avisos por correo

- **Decision**: `AccountSecurityEvent` gana un kind `PASSKEY_COMPROMISED` (detalle: nombre de la llave) y
  un campo opcional `model`; `PASSKEY_ADDED` lo usa para mencionar el modelo verificado. Mismo listener,
  solo a correo confirmado, en el idioma de la cuenta.

## R13 — Privacidad y datos

- **Decision**: el modelo del autenticador entra en "tipo de dispositivo" de la política (sin categoría
  nueva); se agrega una línea que diga que se verifica contra el catálogo de la FIDO Alliance (que se
  descarga, no recibe datos). "Descargar mis datos" suma modelo y estado a la hoja de llaves.
