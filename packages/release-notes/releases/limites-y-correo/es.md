---
title: Un cambio de correo que no pediste se puede detener
summary: Te avisamos cuando se pide cambiar tu correo, y cambiar tu contraseña lo cancela.
commits:
  - 5110a015
  - 95e2d338
  - c3342841
  - d00a6678
---

## Seguridad

- **Aviso al pedir un cambio de correo**: te escribimos a tu correo actual apenas alguien pide
  cambiarlo, no solo cuando el cambio ya ocurrió.
- **Cambiar tu contraseña lo cancela**: cambiar o recuperar tu contraseña anula cualquier cambio
  de correo pendiente y su enlace deja de servir.
- **Límites ante intentos repetidos**: entrar, crear cuenta, recuperar la contraseña, importar y
  subir comprobantes tienen un máximo de intentos seguidos. Si lo alcanzas, esperas unos minutos.
- **Bloqueos que terminan**: cuando termina un bloqueo por códigos equivocados de la verificación
  en dos pasos, la cuenta parte de cero.
- **Conexión siempre cifrada**: tu navegador recuerda que mifik solo se abre por una conexión
  segura, incluso si escribes la dirección sin "https".
