# Matriz de Riesgos de Delitos — FinanceApp

**Fecha:** 2026-09-19 · **Versión:** 1.0 · **Responsable:** Simón Sáez (Encargado de Prevención)

> Identifica, por proceso, dónde puede ocurrir un delito de la Ley 21.595, su nivel de riesgo y el control que lo mitiga. Adaptada al perfil real de FinanceApp: un SaaS de finanzas personales operado hoy por una sola persona, sin pagos a proveedores relevantes, sin licitaciones estatales y sin nómina.

| Proceso | Delito potencial | Probabilidad | Impacto | Nivel | Control mitigante | Control técnico (id) | Estado |
|---|---|---|---|---|---|---|---|
| Acceso a la base de datos de producción (saldos, movimientos, deudas de usuarios) | Delitos informáticos (acceso/uso indebido de datos de terceros) | Media (equipo de 1 persona con acceso total, sin segregación posible hoy) | Alto (dato sensible: situación socioeconómica de cada usuario) | **Alto** | MFA/passkeys en accesos de usuario, aislamiento por `userId`, credenciales de infraestructura fuera del código (`.env` gitignored, sin secretos en el historial de git) | `sec-mfa`, `sec-tenant`, `sec-secrets` | ⚠️ Parcial — falta un audit log de QUIÉN accedió a QUÉ dato de producción y cuándo (`sec-logs` solo cubre sesión, no acceso a datos) |
| Manejo de secretos de infraestructura (`JWT_*`, `MFA_ENCRYPTION_KEY`, credenciales de base de datos) | Delitos informáticos / apropiación indebida | Baja | Alto | Medio | Todos los secretos vía variables de entorno, nunca hardcodeados; `.env` en `.gitignore` | `sec-secrets` | ✅ |
| Facturación / tributario | Delito tributario | Baja (proyecto sin ingresos ni facturación operativa todavía) | — | Bajo | N/A hoy — reevaluar cuando exista facturación real a usuarios | — | ❓ No aplica todavía |
| Pagos a proveedores (S3, IPinfo, hosting) | Lavado / fraude | Baja (montos pequeños, proveedores conocidos) | Bajo | Bajo | Revisión manual por el único responsable (sin doble firma posible con 1 persona) | — | ⚠️ Parcial, proporcional al tamaño actual |
| Contratación con el Estado | Cohecho / fraude en licitaciones | — | — | — | No aplica — FinanceApp no participa en licitaciones estatales | — | N/A |
| Gastos / reembolsos | Administración desleal / fraude | — | — | — | No aplica hoy — sin empleados ni reembolsos | — | N/A |
| Contrataciones / RRHH | Conflicto de interés | — | — | — | No aplica hoy — sin contrataciones | — | N/A |

## Notas
- **La proporcionalidad al tamaño es explícita en este documento, no una omisión**: varios procesos "clásicos" de una matriz de riesgos corporativa (licitaciones, nómina, reembolsos) simplemente no existen todavía en un proyecto de una persona — se marcan N/A en vez de forzar un control ficticio.
- El **riesgo real y concreto de este proyecto específico** es el primero de la tabla: por ser una app que centraliza datos financieros sensibles de sus usuarios, un acceso indebido (interno o por una brecha) es el escenario de mayor impacto — coincide con el hallazgo priorizado de la EIPD (`21719-eipd.md`).
- Actualizar esta matriz cuando: (a) se incorpore personal adicional (reevaluar segregación de funciones), (b) exista facturación real a usuarios (agregar fila tributaria), o (c) se contraten nuevos proveedores.

---
*Borrador generado con compliance-cl (pack ley-21595). No constituye asesoría legal; revisar con un abogado.*
