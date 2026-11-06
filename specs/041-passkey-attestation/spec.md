# Feature Specification: Verificar el autenticador de las llaves de acceso contra el catálogo FIDO

**Feature Branch**: `041-passkey-attestation`

**Created**: 2026-11-05

**Status**: Draft

**Input**: User description: "Passkeys: verificar el autenticador contra el catálogo de la FIDO Alliance. Hoy fik acepta cualquier llave de acceso compatible sin saber qué dispositivo la creó. Queremos aprovechar la attestation del autenticador, cuando la entrega, para saber qué modelo es y no aceptar modelos que la FIDO Alliance declaró comprometidos. Al registrar: se pide la attestation sin exigirla; si se verifica contra el catálogo de metadatos de la FIDO Alliance, se guardan fabricante y modelo y el nombre se precompleta con el modelo (editable); un modelo comprometido o revocado se rechaza con un mensaje claro; sin attestation (passkeys sincronizadas de iCloud o Google, la mayoría de los gestores) se acepta igual que hoy, y nada se rechaza por no poder consultar el catálogo. Llaves ya registradas: el catálogo se revisa periódicamente; una llave verificada que pasa a comprometida deja de servir para entrar y para confirmar identidad, se marca en Perfil → Seguridad y se avisa por correo. Se ve en la lista de llaves (modelo + distintivo verificada/comprometida) y en el correo de 'agregaste una llave de acceso'. Fuera de alcance: exigir attestation, listas propias de fabricantes, revisar llaves registradas antes de esta feature."

## Contexto

Desde specs/022 una persona puede entrar a _fik_ con una llave de acceso (passkey) en vez de su RUT y
contraseña, y desde specs/024 la misma llave sirve para confirmar su identidad antes de una acción
sensible. Al registrar una llave, _fik_ no pide a la llave que diga qué es: acepta cualquier autenticador
compatible con el estándar, y la lista de llaves solo muestra el nombre que la persona escribió.

Algunos autenticadores (llaves físicas como YubiKey, Windows Hello, algunos teléfonos) pueden entregar
una **attestation**: una declaración firmada por el fabricante de qué modelo de autenticador creó la
llave. La FIDO Alliance publica un **catálogo de metadatos** con los modelos certificados y su estado de
seguridad, incluido cuándo un modelo fue declarado comprometido (por ejemplo, cuando se filtró su clave
de fabricación o se descubrió que permite saltarse la huella o el PIN).

Las passkeys **sincronizadas** (llavero de iCloud, Gestor de contraseñas de Google y la mayoría de los
gestores de contraseñas), que son las que usa casi todo el mundo, **no entregan attestation**. Por eso
esta feature nunca la exige: es informativa, y solo bloquea lo que el catálogo declaró comprometido.

## Clarifications

### Session 2026-11-05

- Q: ¿Qué pasa con las sesiones abiertas con una llave que pasa a comprometida? → A: Se cierran al marcarla, y el correo de aviso lo menciona.

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Ver qué autenticador creó cada llave (Priority: P1)

Una persona registra una llave de acceso desde Perfil → Seguridad usando una llave física o Windows
Hello. Como su autenticador entrega una attestation que coincide con el catálogo, el nombre de la llave
viene precompletado con el modelo ("YubiKey 5 NFC"), que puede cambiar antes de guardar. En la lista de
llaves ve el modelo junto al nombre, con un distintivo "Verificada". El correo de aviso "Agregaste una
llave de acceso" menciona el modelo. Otra persona registra una passkey del llavero de iCloud: todo
funciona exactamente como hoy, sin modelo ni distintivo.

**Why this priority**: es la base de todo lo demás (sin saber el modelo no se puede saber si está
comprometido) y aporta valor visible por sí sola: la persona reconoce sus llaves por lo que son, no solo
por el nombre que les puso.

**Independent Test**: registrar una llave con attestation verificable y otra sin attestation; la primera
muestra modelo y distintivo, la segunda se registra y funciona igual que antes.

**Acceptance Scenarios**:

1. **Given** una persona registrando una llave cuyo autenticador entrega una attestation que coincide
   con un modelo del catálogo, **When** el navegador termina la creación, **Then** el campo de nombre
   aparece precompletado con el nombre del modelo y la persona puede cambiarlo antes de guardar.
2. **Given** esa llave guardada, **When** la persona abre Perfil → Seguridad, **Then** la llave muestra
   su nombre, el fabricante y modelo, y el distintivo "Verificada".
3. **Given** esa llave guardada, **When** llega el aviso de seguridad por correo, **Then** el correo
   nombra la llave y su modelo verificado.
4. **Given** una persona registrando una passkey sincronizada que no entrega attestation, **When**
   termina el registro, **Then** la llave se guarda igual que hoy, sin modelo ni distintivo, y sirve
   para entrar y confirmar identidad.
5. **Given** un autenticador que entrega una attestation que no se puede verificar contra el catálogo
   (modelo desconocido, firma inválida o no certificada), **When** termina el registro, **Then** la llave
   se guarda como no verificada, igual que una sin attestation, sin mostrar ningún modelo.

---

### User Story 2 - No registrar autenticadores comprometidos (Priority: P2)

Una persona intenta registrar una llave con un modelo que la FIDO Alliance declaró comprometido. _fik_
rechaza el registro y le explica por qué y qué hacer: usar otra llave o una passkey del teléfono o del
gestor de contraseñas.

**Why this priority**: es la protección real que justifica la feature, pero depende de US1 (identificar el
modelo) y afecta a muy pocas personas.

**Independent Test**: simular el registro con un autenticador cuyo modelo el catálogo marca como
comprometido; el registro se rechaza con el mensaje y no queda ninguna llave guardada.

**Acceptance Scenarios**:

1. **Given** un autenticador cuya attestation verificada corresponde a un modelo marcado como
   comprometido en el catálogo, **When** la persona intenta registrarlo, **Then** el registro se rechaza,
   no se guarda ninguna llave y la persona ve un mensaje que explica que ese modelo fue declarado
   inseguro por su fabricante o la FIDO Alliance y le sugiere usar otro.
2. **Given** que el catálogo no se pudo consultar ni hay una copia reciente disponible, **When** la
   persona registra una llave con attestation, **Then** la llave se guarda como no verificada y no se
   rechaza nada por ese motivo.

---

### User Story 3 - Dejar de aceptar llaves que pasan a estar comprometidas (Priority: P3)

Una persona registró hace meses una llave física verificada. Hoy la FIDO Alliance declara comprometido
ese modelo. En la siguiente revisión del catálogo, _fik_ marca la llave como comprometida: deja de servir
para entrar y para confirmar identidad, aparece con el distintivo "Comprometida" en Perfil → Seguridad
con una explicación, y la persona recibe un correo pidiéndole que la reemplace. Puede seguir entrando con
su RUT y contraseña (y su verificación en dos pasos, si la tiene) y quitar la llave cuando quiera.

**Why this priority**: cierra el ciclo para llaves ya registradas, pero es el caso más raro y requiere
una revisión periódica del catálogo.

**Independent Test**: con una llave verificada de un modelo que luego se marca como comprometido en el
catálogo, correr la revisión; la llave queda marcada, no sirve para entrar ni para confirmar identidad, y
llega un solo correo de aviso.

**Acceptance Scenarios**:

1. **Given** una llave verificada cuyo modelo pasa a figurar como comprometido, **When** corre la
   revisión periódica del catálogo, **Then** la llave queda marcada como comprometida con la fecha en
   que se detectó.
2. **Given** una llave marcada como comprometida, **When** la persona intenta entrar con ella, **Then**
   el ingreso se rechaza con un mensaje que explica que esa llave ya no es segura y que entre con su RUT
   y contraseña.
3. **Given** una llave marcada como comprometida, **When** la persona necesita confirmar su identidad,
   **Then** esa llave no se ofrece como método y, si se intenta usar, se rechaza.
4. **Given** una llave recién marcada como comprometida, **When** termina la revisión, **Then** la
   persona recibe un correo (solo a un correo confirmado) que nombra la llave y le pide reemplazarla; las
   revisiones siguientes no repiten el aviso.
5. **Given** una llave marcada como comprometida, **When** la persona abre Perfil → Seguridad, **Then**
   la ve con el distintivo "Comprometida" y una explicación, y puede quitarla o renombrarla como
   cualquier otra.
6. **Given** sesiones abiertas iniciando sesión con una llave que la revisión marca como comprometida,
   **When** termina la revisión, **Then** esas sesiones quedan cerradas (las abiertas de otra forma no se
   tocan) y el correo de aviso lo menciona.
7. **Given** una llave registrada antes de esta feature, o una sin attestation, **When** corre la
   revisión, **Then** no se modifica.

---

### Edge Cases

- **La llave comprometida era la única forma que la persona usaba para entrar**: la cuenta siempre tiene
  contraseña, así que puede entrar con RUT y contraseña (más su segundo factor si lo tiene) o recuperar
  la contraseña por correo.
- **Un modelo deja de figurar como comprometido en el catálogo** (la FIDO Alliance retira la alerta): la
  llave sigue marcada como comprometida; la persona puede registrarla de nuevo si quiere. Un bloqueo de
  seguridad no se levanta solo.
- **El catálogo descargado no es auténtico** (firma inválida o vencido): se descarta, se sigue usando la
  última copia válida y no se marca ni se desmarca ninguna llave con él.
- **La revisión falla a mitad de camino**: lo ya marcado queda marcado; la próxima revisión retoma el
  resto. Correr la revisión dos veces no duplica marcas ni correos.
- **Dos llaves de la misma persona del mismo modelo comprometido**: ambas se marcan; un correo por llave.
- **El autenticador entrega attestation pero el navegador la anonimiza**: se trata como sin attestation.
- **Al editar una llave**, la persona puede cambiar su nombre, pero no el modelo ni el estado, que vienen
  de la verificación.
- **La persona descarga sus datos**: las llaves incluyen su modelo y su estado.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: Al registrar una llave de acceso, el sistema MUST pedir al autenticador su attestation sin
  exigirla: un autenticador que no la entrega se registra igual que hoy.
- **FR-002**: Cuando el autenticador entrega una attestation, el sistema MUST verificarla contra el
  catálogo de metadatos de la FIDO Alliance; solo una attestation cuya firma se valida y cuyo modelo
  figura en el catálogo cuenta como verificada.
- **FR-003**: Para una llave verificada, el sistema MUST guardar el fabricante y modelo según el catálogo
  y mostrarlos en la lista de llaves con el distintivo "Verificada".
- **FR-004**: Al terminar la creación de una llave verificada, el sistema MUST precompletar el nombre con
  el modelo; la persona MUST poder cambiarlo antes de guardar y después, como hoy.
- **FR-005**: El sistema MUST rechazar el registro de un autenticador cuyo modelo el catálogo declara
  comprometido (revocado, clave de attestation comprometida, o que permite saltarse la verificación de la
  persona), sin guardar ninguna llave, con un mensaje que explique el motivo y sugiera otra opción.
- **FR-006**: Una attestation presente que no se puede verificar (firma inválida, modelo fuera del
  catálogo, catálogo no disponible) MUST tratarse como ausente: la llave se guarda como no verificada y
  el registro no se rechaza por ese motivo.
- **FR-007**: El sistema MUST mantener una copia del catálogo y actualizarla periódicamente, al menos una
  vez al día, y solo MUST guardar una copia cuya firma de la FIDO Alliance sea válida. Una copia vencida
  (la FIDO Alliance no publicó una nueva a tiempo o no se pudo bajar) se sigue usando para identificar
  modelos y para rechazar el registro de un modelo comprometido, pero no para marcar llaves ya
  registradas.
- **FR-008**: En cada actualización del catálogo, el sistema MUST revisar las llaves verificadas y marcar
  como comprometidas, con la fecha, las de modelos que ahora figuran como comprometidos.
- **FR-009**: Una llave marcada como comprometida MUST dejar de servir para iniciar sesión y para
  confirmar identidad, con un mensaje claro; no MUST ofrecerse como método de confirmación.
- **FR-010**: Una llave marcada como comprometida MUST seguir marcada aunque el catálogo retire la alerta.
- **FR-011**: Al marcar una llave como comprometida, el sistema MUST avisar una sola vez por correo, solo
  a un correo confirmado y en el idioma de la cuenta, nombrando la llave, pidiendo reemplazarla y
  diciendo que se cerraron las sesiones abiertas con ella.
- **FR-011a**: Al marcar una llave como comprometida, el sistema MUST cerrar en el mismo paso las
  sesiones abiertas iniciando sesión con esa llave; las sesiones abiertas de otra forma no se tocan. Por
  eso cada sesión MUST recordar con qué llave se abrió, cuando se abrió con una.
- **FR-012**: La lista de llaves en Perfil → Seguridad MUST mostrar, para una llave comprometida, el
  distintivo "Comprometida" y una explicación; la persona MUST poder quitarla y renombrarla.
- **FR-013**: El aviso de seguridad "Agregaste una llave de acceso" MUST nombrar el modelo cuando la
  llave está verificada.
- **FR-014**: Las llaves sin attestation verificada (sincronizadas, registradas antes de esta feature, no
  verificables) MUST funcionar exactamente como hoy y nunca ser marcadas por la revisión.
- **FR-015**: Ni el modelo ni el estado de una llave MUST poder cambiarse desde la aplicación: solo los
  determina la verificación y la revisión del catálogo.
- **FR-016**: "Descargar mis datos" MUST incluir el modelo y el estado de cada llave.
- **FR-017**: La revisión periódica MUST ser segura de repetir: correrla dos veces o retomarla después de
  un fallo no duplica marcas ni correos.

### Key Entities

- **Llave de acceso** (existente): gana el resultado de la verificación — si fue verificada, su
  identificador de modelo, el nombre del fabricante y modelo según el catálogo, y si está comprometida,
  desde cuándo y por qué (según el catálogo).
- **Sesión** (existente): recuerda con qué llave de acceso se abrió, si se abrió con una.
- **Catálogo de metadatos FIDO**: la lista de modelos de autenticadores certificados con su estado de
  seguridad, firmada por la FIDO Alliance; se guarda la última copia válida, cuándo se obtuvo y hasta
  cuándo es válida.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: El 100% de las llaves registradas con una attestation verificable muestra su fabricante y
  modelo en Perfil → Seguridad.
- **SC-002**: El 100% de los intentos de registrar un modelo declarado comprometido se rechaza, sin dejar
  ninguna llave guardada.
- **SC-003**: El 100% de las passkeys sin attestation (incluidas las sincronizadas de iCloud y Google) se
  registra y usa sin cambios observables respecto de hoy: mismos pasos y mismo tiempo de registro.
- **SC-004**: Una llave verificada cuyo modelo pasa a comprometido deja de servir para entrar a más
  tardar 24 horas después de que el catálogo lo publique, y la persona recibe exactamente un correo.
- **SC-005**: Que el catálogo no esté disponible nunca impide registrar una llave ni entrar con una llave
  no comprometida.

## Assumptions

- La política es la decidida por el dueño del producto: informativa, y solo bloquea modelos que el
  catálogo declara comprometidos. No se exige attestation ni hay listas propias de fabricantes.
- El catálogo de la FIDO Alliance es público y de descarga gratuita; su revisión diaria basta (la FIDO
  Alliance lo publica aproximadamente una vez al mes).
- Las llaves registradas antes de esta feature no tienen attestation guardada y no se revisan; seguirán
  sin modelo ni distintivo (la persona puede registrarlas de nuevo si quiere verlos).
- Guardar el modelo de un autenticador no cambia las categorías de datos de la política de privacidad
  (es información técnica del dispositivo, ya cubierta por "tipo de dispositivo y navegador"); se
  revisará al implementar.
- La revisión periódica corre con las demás tareas programadas del servidor, fuera del horario de mayor
  uso.
