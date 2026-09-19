# Feature Specification: Migrar geolocalización de sesiones a IPinfo con caché

**Feature Branch**: `026-ipinfo-geolocation`

**Created**: 2026-09-19

**Status**: Draft

**Input**: User description: "Migrar la geolocalización de sesiones (GeoIpLookup, hoy un archivo GeoLite2 local de MaxMind vía GEOIP_DB_PATH) a la API de IPinfo Lite (gratis e ilimitada, licencia CC BY-SA 4.0 — requiere atribución visible en la app). Lite solo entrega país + ASN, no ciudad — se pierde la precisión de ciudad que hoy da MaxMind; SecuritySection pasa a mostrar solo el país. Se construye con caché propia primero (decisión explícita: por si a futuro se sube a un plan pago de IPinfo con cuota limitada) — tabla nueva ip-geolocation-cache (dominio-tabla propio, TTL 30-90 días, purgada por un cron diario nuevo, mismo patrón que idempotency-record). En cada sesión nueva: consulta primero la caché por esa IP exacta; si no está, llama a IPinfo Lite (fetch nativo de Node, sin dependencia nueva) y guarda el resultado para la próxima vez. Sin cambio de contrato público: GeoIpLookup.lookup(ip) sigue igual — SessionIssuer no se entera del cambio interno. city queda siempre null para sesiones nuevas (las viejas conservan el dato histórico de MaxMind, sin migración). Alcance: IPINFO_TOKEN nuevo, inerte sin configurar (mismo patrón que S3/GEOIP_DB_PATH hoy) — sin token, cae de vuelta a MaxMind local si GEOIP_DB_PATH sigue configurado, o sin país si tampoco. Atribución a IPinfo visible en algún lugar de la app (footer o página de perfil/about). Fuera de alcance: soporte de ciudad (no lo da Lite), cualquier otro dato de IPinfo Lite (ASN, continente)."

## User Scenarios & Testing _(mandatory)_

### User Story 1 - El país de una sesión se resuelve sin depender de un archivo local (Priority: P1)

Como responsable de mantener este proyecto, quiero que resolver el país aproximado de una sesión no dependa de que cada entorno de desarrollo descargue y mantenga a mano un archivo de base de datos (GeoLite2), sino de un servicio con datos siempre actualizados.

**Why this priority**: Es la razón de ser de la migración — el archivo local (gitignoreado, cada dev/entorno se lo baja aparte) es la fricción operativa que se quiere eliminar.

**Independent Test**: Con `IPINFO_TOKEN` configurado y sin `GEOIP_DB_PATH`, iniciar sesión desde una IP nueva (nunca antes vista) y verificar que la sesión creada trae un país resuelto, sin ningún archivo `.mmdb` presente en el entorno.

**Acceptance Scenarios**:

1. **Given** `IPINFO_TOKEN` configurado, **When** un usuario inicia sesión desde una IP que nunca se consultó antes, **Then** la sesión creada muestra el país correspondiente a esa IP.
2. **Given** `IPINFO_TOKEN` configurado, **When** un usuario inicia sesión desde una IP que YA se consultó antes (por cualquier usuario), **Then** el país se resuelve sin una llamada de red nueva al servicio externo.
3. **Given** ninguna variable de geolocalización configurada (ni `IPINFO_TOKEN` ni `GEOIP_DB_PATH`), **When** un usuario inicia sesión, **Then** la sesión se crea igual, simplemente sin país (mismo comportamiento "inerte sin configurar" que ya existe hoy).

---

### User Story 2 - El dato de ciudad deja de mostrarse para sesiones nuevas (Priority: P2)

Como usuario que revisa su lista de sesiones, entiendo que las sesiones creadas a partir de ahora muestran solo el país (ya no la ciudad), porque el servicio de geolocalización elegido no ofrece ese nivel de detalle en su plan gratuito.

**Why this priority**: Es una consecuencia directa y visible de la migración — el usuario nota la diferencia respecto a sesiones antiguas que sí mostraban ciudad, así que debe comportarse de forma consistente (nunca a medias ni con datos inventados).

**Independent Test**: Comparar una sesión creada ANTES de la migración (con ciudad) contra una creada DESPUÉS (sin ciudad) en la misma lista de "Sesiones y dispositivos", y confirmar que ambas se muestran correctamente según su propio dato — ninguna intenta rellenar el campo que no tiene.

**Acceptance Scenarios**:

1. **Given** una sesión creada después de la migración, **When** el usuario la ve en su lista de sesiones, **Then** se muestra su país pero ningún dato de ciudad (ni un valor inventado ni un error).
2. **Given** una sesión creada antes de la migración (con ciudad ya guardada), **When** el usuario la ve en su lista de sesiones, **Then** su ciudad histórica se sigue mostrando exactamente igual que hoy — la migración no borra datos ya guardados.

---

### User Story 3 - La app cumple la condición de atribución del proveedor (Priority: P2)

Como responsable del proyecto, quiero que la app cumpla la única condición de la licencia del servicio de geolocalización elegido (dar crédito visible al proveedor), para poder usarlo legítimamente incluso si la app cobra por otras funciones.

**Why this priority**: Es una condición de licencia, no opcional — sin esto, el uso del servicio no está cubierto por los términos que lo permiten gratis.

**Independent Test**: Revisar la app (footer o página de perfil/about) y confirmar que existe una mención visible al proveedor de datos de geolocalización.

**Acceptance Scenarios**:

1. **Given** cualquier pantalla de la app, **When** un usuario navega a donde se ubique la atribución (footer o "Acerca de"), **Then** encuentra una mención visible al proveedor de los datos de geolocalización.

---

### Edge Cases

- La misma IP consultada por DOS usuarios distintos en momentos distintos: la segunda consulta reutiliza el resultado cacheado de la primera (la caché no es por usuario, es por IP).
- Una IP cuyo país cambió con el tiempo (bloques de IP se reasignan): el dato cacheado puede quedar desactualizado hasta que expire y se vuelva a consultar — se acepta como limitación conocida, no un bug.
- El servicio externo de geolocalización no responde o responde con error: la sesión se crea igual, sin país, exactamente como hoy cuando el archivo local falta o está corrupto — nunca bloquea el login.
- Un entorno con `GEOIP_DB_PATH` Y `IPINFO_TOKEN` configurados a la vez: IPinfo (con su caché) es la fuente preferida; MaxMind local queda como diseño previo, no como respaldo automático de esta feature (ver Assumptions).

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: El sistema DEBE resolver el país aproximado de una sesión nueva a partir de un servicio externo de geolocalización por IP, en vez de un archivo de base de datos local.
- **FR-002**: El sistema DEBE consultar primero un almacenamiento interno propio antes de llamar al servicio externo para una IP dada — una IP ya consultada antes (por cualquier usuario) NO DEBE generar una llamada de red nueva.
- **FR-003**: El resultado de una consulta nueva al servicio externo DEBE guardarse en ese almacenamiento interno para que consultas futuras de la misma IP lo reutilicen.
- **FR-004**: Un resultado guardado DEBE tener un tiempo de vida limitado (no permanecer indefinidamente) — pasado ese tiempo, la siguiente consulta de esa IP DEBE tratarse como nueva.
- **FR-005**: El sistema NO DEBE resolver ciudad para ninguna sesión nueva — únicamente país.
- **FR-006**: El sistema NO DEBE modificar ni borrar el dato de ciudad ya guardado en sesiones creadas antes de esta migración.
- **FR-007**: Si el servicio externo no está configurado, no responde, o responde con error, el sistema DEBE crear la sesión igual, sin país — nunca debe impedir el login.
- **FR-008**: La app DEBE mostrar, en al menos un lugar visible, una atribución al proveedor de los datos de geolocalización.

### Key Entities

- **Caché de geolocalización por IP**: un registro nuevo que asocia una IP con el país resuelto para ella y cuándo vence ese dato. No pertenece a ningún usuario en particular — una misma IP consultada por distintos usuarios comparte el mismo registro.
- **Sesión (Session)**: entidad ya existente (specs/023). Esta feature no le agrega atributos nuevos — su campo de país sigue poblándose igual que hoy, y su campo de ciudad simplemente deja de recibir un valor nuevo (queda intacto para las filas que ya lo tenían).

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: El 100% de los logins desde una IP nunca antes vista, con el servicio externo configurado, resultan en una sesión con país resuelto.
- **SC-002**: El 100% de los logins desde una IP ya consultada antes NO generan una llamada de red nueva al servicio externo.
- **SC-003**: El 100% de las sesiones nuevas muestran ciudad vacía (nunca un valor inventado o incorrecto); el 100% de las sesiones antiguas conservan su ciudad histórica sin cambios.
- **SC-004**: El 100% de los logins con el servicio externo caído o sin configurar completan exitosamente, sin país mostrado.
- **SC-005**: La atribución al proveedor está presente y visible en el 100% de las visitas a la pantalla donde se ubique.

## Assumptions

- El foco de esta migración es dejar de depender de un archivo local descargado a mano — no maximizar precisión geográfica. Perder el dato de ciudad es una consecuencia aceptada, no un defecto a corregir aquí.
- La caché se construye de todos modos aunque el plan elegido del servicio externo no tenga límite de cuota hoy, como preparación explícita para un eventual cambio a un plan con cuota limitada en el futuro (decisión de producto).
- Un entorno que ya tenía `GEOIP_DB_PATH` configurado y ahora también configura el servicio externo no combina ambas fuentes — el servicio externo (con su caché) pasa a ser la única fuente activa; MaxMind local queda como mecanismo previo, no como un respaldo automático adicional de esta feature.
- La atribución exigida por la licencia del proveedor es un requisito de cumplimiento, no una decisión de diseño visual — su ubicación exacta (footer vs. página de perfil) es un detalle de implementación a resolver en el plan, no una ambigüedad de producto.
- No existe todavía ningún cliente HTTP hacia servicios externos en este proyecto — esta feature es la primera en necesitar una llamada de red saliente a una API de terceros (aparte de servicios ya integrados como S3).
