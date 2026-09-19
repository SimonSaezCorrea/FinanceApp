# Modelo de Prevención de Delitos (MPD) — FinanceApp

**RUT:** [COMPLETAR] · **Vigente desde:** 2026-09-19 · **Versión:** 1.0
**Encargado de Prevención:** Simón Sáez

> Conforme a la Ley 21.595 (que amplía la Ley 20.393). **Ya vigente** desde el 1-sep-2024, aplica a toda empresa sin umbral — incluida una SpA/proyecto de una persona como FinanceApp. Modelo proporcional al tamaño real de la empresa.

## 1. Objeto y alcance
Este modelo busca prevenir la comisión de delitos que puedan generar responsabilidad penal de FinanceApp. Aplica hoy a su único integrante, Simón Sáez, y a cualquier socio, administrador, trabajador o prestador de servicios que se incorpore en el futuro.

## 2. Encargado de Prevención de Delitos
Se designa a **Simón Sáez** como Encargado de Prevención — ver `21595-acta-encargado-prevencion.md` para el acta formal y la limitación reconocida de autonomía cuando el Encargado y la administración son la misma persona.

## 3. Identificación de riesgos
Detallados en `21595-matriz-riesgos.md`. Proceso de mayor exposición en FinanceApp: **el acceso a los datos financieros de los usuarios** (saldos, movimientos, deudas) — el riesgo de delito informático es más relevante aquí que los riesgos "clásicos" de una matriz corporativa (licitaciones, nómina), que hoy no aplican por el tamaño del proyecto.

## 4. Controles internos
- **Procedimientos de autorización**: con un equipo de una persona, no existe hoy doble autorización — se documenta como limitación proporcional, no se simula un control ficticio.
- **Segregación de funciones**: no es posible estructuralmente hoy (ver `21595-acta-encargado-prevencion.md` sección 2) — a revisar cuando se incorpore una segunda persona.
- **Controles tributarios**: no aplican todavía — el proyecto no tiene facturación operativa.
- **Controles de acceso a sistemas y datos**: MFA/passkeys opcionales para usuarios (`sec-mfa`), aislamiento estricto por usuario (`sec-tenant`), secretos fuera del código (`sec-secrets`) — ver estado detallado en `RESUMEN.md`.
- **Debida diligencia de contrapartes**: no aplica hoy — sin proveedores/clientes B2B relevantes más allá de infraestructura técnica (S3, IPinfo).

## 5. Canal de denuncias
Ver `21595-reglamento-canal-denuncias.md`. Canal provisional por correo, con la limitación reconocida de no ser independiente del propio Encargado mientras el equipo sea de una persona.

## 6. Capacitación
Con un equipo de una persona, la "capacitación" es autoformación del Encargado sobre este modelo y el código de ética — se formalizará una capacitación real al incorporar personal.

## 7. Régimen disciplinario
Se aplicará conforme al reglamento interno (a redactar cuando exista personal) y la legislación laboral, según gravedad.

## 8. Supervisión y actualización
El Encargado supervisa el modelo y lo actualiza al menos anualmente o ante cambios relevantes del negocio (incorporación de personal, facturación real, nuevos proveedores). **La supervisión EXTERNA periódica (anual) por un tercero independiente es obligatoria para que el modelo se considere "adecuado"** — es el único componente de este pack que no es self-service (requiere contratar a un tercero, ~UF 3-5, no necesariamente abogado) y queda pendiente de contratar.

---
*Borrador generado con compliance-cl (pack ley-21595). No constituye asesoría legal; revisar con un abogado.*
