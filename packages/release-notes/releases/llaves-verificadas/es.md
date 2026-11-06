---
title: Llaves de acceso verificadas
summary: Ves qué modelo es cada llave física y dejamos de aceptar modelos inseguros.
commits:
  - 31b328ef
  - 5cefd9d3
---

## Nuevo

- **Modelo verificado de tu llave de acceso**: si registras una llave física (como una YubiKey) o
  Windows Hello y aceptas compartir su modelo, lo verificamos contra el catálogo de la FIDO Alliance.
  En Perfil → Seguridad la ves con el distintivo "Verificada" y su modelo, y el nombre viene
  precompletado (lo puedes cambiar).
- **Modelos inseguros**: si el fabricante o la FIDO Alliance declara inseguro un modelo, no se puede
  registrar. Si una llave tuya pasa a esa lista, deja de servir para entrar y confirmar tu identidad,
  cerramos las sesiones abiertas con ella y te avisamos por correo para que la reemplaces.

## Cambios

- Las passkeys del teléfono o del gestor de contraseñas (iCloud, Google y otros) funcionan igual que
  antes: no informan su modelo, así que no llevan distintivo.
