---
title: Un cambio de correo que no pediste se puede detener
summary: Te avisamos cuando se pide cambiar tu correo, y cambiar tu contraseña lo cancela.
commits:
  - 5110a015
  - 95e2d338
  - c3342841
  - d00a6678
  - 6ca4569a
  - 4363f2b9
  - 38e123ea
  - 8fab17b6
  - 3975a371
  - 100a2857
  - 73dc957c
  - 7ddae207
  - ca26361e
  - 357ae1e3
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
- **Reemplazar todo pide confirmar que eres tú**: antes de borrar tus datos para importar la
  plantilla, como al cambiar tu correo.
- **Cada código de verificación sirve una vez**: el código de tu app de autenticación ya no se puede
  usar dos veces.
- **Sesiones con fecha de término**: una sesión se cierra a los 30 días aunque la uses, y si alguien
  intenta usar una copia vieja de ella, se cierra al momento.
- **Recuperar la contraseña borra tus llaves de acceso**: si alguien hubiera agregado una llave a tu
  cuenta, deja de servirle. Después vuelve a registrar las tuyas en Perfil, Seguridad.
- **Solo corre el código de mifik**: tu navegador ejecuta únicamente el código que publicamos, así
  que un script metido en una página no se ejecuta.

## Correcciones

- **Menos errores de conexión pasajeros**: si el servidor no logra ubicar la API por un instante,
  ahora igual responde en vez de devolverte un error después de esperar.
