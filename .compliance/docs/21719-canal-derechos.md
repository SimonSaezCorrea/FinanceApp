# Canal de ejercicio de derechos — FinanceApp

> Art. 14 ter: el responsable debe ofrecer un medio para que el titular ejerza sus derechos.

## 1. Texto público ("Tus derechos", para la web/política)
> Como titular de tus datos puedes ejercer estos derechos: **acceso, rectificación, supresión, oposición, portabilidad y bloqueo**. Escríbenos a **simon.alejandro.saez@gmail.com**. Responderemos dentro de los plazos legales y sin costo en los casos que la ley establece.

## 2. Procedimiento interno (plazos verificados contra la ley)
1. **Recepción:** registrar la solicitud (titular, derecho pedido, fecha) y verificar identidad (hoy: manual, por correo — no hay formulario dedicado en la app).
2. **Plazo de respuesta: 30 días corridos**, prorrogable **una sola vez hasta por 30 días corridos** más, avisando al titular (Art. 11).
3. **Gratuidad:** rectificación, supresión y oposición son **siempre gratuitas**. El **acceso** es gratuito **al menos una vez por trimestre**.
4. **Ejecución por derecho — estado real en el código de FinanceApp:**
   - **Acceso**: parcial — el usuario ve su propio perfil (`GET /auth/me`), pero no hay una exportación completa de TODOS sus datos (cuentas, movimientos, deudas, ahorros, sesiones).
   - **Portabilidad**: ❌ no implementada — no existe endpoint de exportación en formato estructurado (JSON/CSV).
   - **Rectificación**: ✅ implementada — `PATCH /auth/me` permite corregir nombre, email, dirección, teléfono, etc.
   - **Supresión**: ⚠️ parcial — `POST /auth/me/deactivate` **desactiva** la cuenta (soft-disable, Art. `User.status: DISABLED`), pero **no elimina los datos**. No hay un endpoint de borrado definitivo.
   - **Oposición**: ❌ no hay mecanismo para oponerse a un tratamiento específico manteniendo el resto de la cuenta.
   - **Bloqueo**: ❌ no existe un estado de "bloqueo temporal mientras se resuelve una solicitud", distinto de la desactivación completa.
5. **Cierre:** responder por escrito y guardar evidencia de la respuesta — hoy sin sistema de tracking (se recomienda una bandeja de solicitudes, aunque sea una planilla, mientras no exista un canal dedicado en la app).

## 3. Si no se puede cumplir
Informar el motivo legal por escrito. El titular puede reclamar ante la **Agencia de Protección de Datos**.

## 4. Remediación priorizada
El hueco más importante para cerrar aquí es **portabilidad + supresión real**, porque hoy solo existe rectificación y una desactivación que no borra nada — ver `references/build/` para las recetas de implementación (endpoint de exportación + borrado en cascada respetando obligaciones legales de conservación, si las hubiera).

---
*Borrador generado con compliance-cl (pack ley-21719). No constituye asesoría legal; revisar con un abogado.*
