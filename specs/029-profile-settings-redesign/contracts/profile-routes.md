# UI Contract: rutas de Perfil (029)

Esta feature no agrega ni cambia endpoints del API. El único contrato público nuevo son las
direcciones del navegador (enlazables, recargables, con historial).

| Dirección                   | Forma ancha (`panes`)             | Forma angosta (`stack`)                                                                                                     | Título de pestaña               |
| --------------------------- | --------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| `/profile`                  | Navegación + **Resumen**          | Vista inicial: identidad, Resumen sin ajustes rápidos (protección, tus datos, sesiones), lista de secciones, "Próximamente" | `Cuadra · Perfil`               |
| `/profile/personal`         | Navegación + Información personal | Pantalla Información personal con "volver"                                                                                  | `Cuadra · Información personal` |
| `/profile/security`         | Navegación + Seguridad            | Pantalla Seguridad con "volver"                                                                                             | `Cuadra · Seguridad`            |
| `/profile/preferences`      | Navegación + Preferencias         | Pantalla Preferencias con "volver"                                                                                          | `Cuadra · Preferencias`         |
| `/profile/privacy`          | Navegación + Datos y privacidad   | Pantalla Datos y privacidad con "volver"                                                                                    | `Cuadra · Datos y privacidad`   |
| `/profile/<cualquier otra>` | Redirige (`replace`) a `/profile` | Igual                                                                                                                       | —                               |

## Parámetros y anclas reconocidos

| Dirección                                                                | Efecto                                                                                                                     |
| ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| `/profile/personal?edit=email\|phone\|identifier`                        | Abre esa fila en edición al llegar; el parámetro se quita con `replace` (recargar no reabre). Valor desconocido: se ignora |
| `/profile/security#password` / `#two-factor` / `#passkeys` / `#sessions` | Desplaza y enfoca ese bloque al llegar                                                                                     |

## Reglas

- Todas requieren sesión (mismo `RequireAuth` que hoy); sin sesión llevan al panel de acceso con
  `volver=<dirección pedida>`, como cualquier ruta protegida.
- "Volver" en la forma angosta navega a `/profile` (no `history.back()`), para que funcione también
  al entrar por un enlace directo.
- Con una edición sin guardar en Información personal, cualquier navegación interna pide
  "¿Descartar cambios?" (spec FR-007a); recargar o cerrar descarta sin preguntar.
- Enlaces existentes a `/profile` (barra lateral, menú "Más" del teléfono, enlaces del Panel) siguen
  funcionando sin cambios.
