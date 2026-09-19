# Registro de Vulneraciones a las Medidas de Seguridad — FinanceApp

> Art. 14 sexies: registrar **toda** vulneración de seguridad (destrucción, pérdida, filtración o alteración no autorizada), **aunque no se notifique**. Documento interno, append-only.

| # | Fecha detección | Quién detecta | Naturaleza de la vulneración | Datos afectados (categorías) | N° titulares aprox. | ¿Riesgo alto? | ¿Notificada a Agencia? | ¿Notificada a titulares? | Medidas adoptadas | Causa raíz |
|---|---|---|---|---|---|---|---|---|---|---|
| — | — | — | — | — | — | — | — | — | — | — |

*Sin incidentes registrados a la fecha de esta corrida (2026-09-19). Este archivo se mantiene append-only: agregar una fila por cada incidente real, nunca borrar filas anteriores.*

## Notas
- Se registra **toda** vulneración, se notifique o no. La decisión de notificar (riesgo) queda documentada.
- Notificar a titulares también si afecta datos sensibles, económicos/financieros/bancarios o de niños, niñas y adolescentes — el caso central de este proyecto.
- Revisión previa de gitignore/historial confirmó que **no hay archivos `.env` comprometidos en el historial de git** de este repositorio (verificado con `git log --all --diff-filter=A --name-only`), lo que reduce el riesgo de una filtración de secretos por ese camino.

---
*Borrador generado con compliance-cl (pack ley-21719). No constituye asesoría legal; revisar con un abogado.*
