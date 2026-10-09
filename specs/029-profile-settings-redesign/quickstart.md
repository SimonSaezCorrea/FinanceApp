# Quickstart: validar Perfil como ajustes por secciones (029)

## Prerrequisitos

- `pnpm install`, API y web corriendo (`pnpm dev`), base sembrada (`pnpm db:seed`).
- Usuario demo con sesión iniciada.

## Pruebas automáticas (acotadas al cambio)

```bash
pnpm --filter @finance/web exec vitest run src/domains/profile src/shared/ui src/i18n src/domains/landing
pnpm --filter @finance/web exec tsc --noEmit -p .
pnpm --filter @finance/web exec eslint src/domains/profile src/shared
pnpm exec prettier --check apps/web/src
```

Esperado: todo en verde; `i18n/parity.test.ts` confirma paridad es/en (SC-007).

## Escenarios manuales

1. **Resumen sin abrir nada (US1, SC-001).** Abrir `/profile` en escritorio con la barra lateral
   contraída: navegación a la izquierda, Resumen a la derecha. Con dos pasos desactivada se lee
   "2 de 3" (si hay una llave) y el siguiente paso "Activar dos pasos".
2. **Siguiente paso lleva al punto (US1).** Pulsar "Activar dos pasos": la URL pasa a
   `/profile/security#two-factor` y el bloque de dos pasos queda a la vista.
3. **Dato faltante (US1).** Sin teléfono: Resumen muestra 2 de 3; "Agregar teléfono" abre
   `/profile/personal` con la fila de teléfono en edición. Recargar no la reabre.
4. **Dirección directa y comodín (US2, SC-002).** Abrir `/profile/privacy` directamente: se ve Datos
   y privacidad. Abrir `/profile/cualquiera`: termina en `/profile`.
5. **Teléfono (US2, SC-006).** Ventana de ~390 px: `/profile` muestra identidad, el Resumen
   (protección, tus datos con "Agregar teléfono", sesiones; sin ajustes rápidos) y la lista. Tocar Seguridad abre su pantalla; "volver" y el "atrás" del navegador regresan a la lista.
6. **Ancho de contenedor (R2).** A 1024 px de viewport, expandir y contraer la barra lateral: con
   ella abierta, una columna; contraída, dos paneles. La sección abierta se mantiene.
7. **Edición sin guardar (FR-007a).** Escribir en el teléfono sin guardar y elegir otra sección:
   aparece "¿Descartar cambios?"; "Seguir editando" conserva lo escrito. Recargar la página descarta
   sin preguntar.
8. **Sin controles inertes (US4, SC-003).** Recorrer las 5 secciones: no hay interruptores de
   notificaciones ni "Exportar"; "Próximamente" es solo texto. "Eliminar cuenta" solo está en Datos
   y privacidad.
9. **Tema (US4).** En Preferencias y en Ajustes rápidos, elegir Sistema: la app sigue el tema del
   dispositivo; el selector de la barra lateral refleja el mismo valor.
10. **Sin soporte de llaves (FR-010a).** En un navegador sin WebAuthn (o simulándolo), con dos pasos
    pendiente: la etapa de llave dice "no disponible en este dispositivo" y el siguiente paso es dos
    pasos.
11. **Muchas sesiones (FR-012).** Con 5 sesiones abiertas: el Resumen lista 3 y "y 2 más".

## Sin verificar automáticamente

Teléfono real (gestos, teclado, safe areas): validar a mano en un iPhone/Android, como el resto de
la app.
