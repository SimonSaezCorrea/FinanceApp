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
  - 9f4d49e0
  - a943f657
  - bf4bb92f
  - c72bb3da
  - 25337007
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
- **Tu navegador no queda bloqueado por intentos ajenos**: si alguien prueba contraseñas con tu
  RUT, los navegadores donde ya entraste siguen pudiendo entrar, y dentro de tu sesión puedes
  cambiar la contraseña igual.
- **Borrar la cuenta o cambiar la contraseña pide tu segundo factor**: si tienes verificación en
  dos pasos o una llave de acceso, además de la contraseña.
- **Comprobantes**: hasta 10 por movimiento y 1.000 en total, y al borrar un movimiento, una cuenta
  o tu cuenta de mifik también se borran sus archivos.
- **Solo corre el código de mifik**: tu navegador ejecuta únicamente el código que publicamos, así
  que un script metido en una página no se ejecuta.

## Correcciones

- **Menos errores de conexión pasajeros**: si el servidor no logra ubicar la API por un instante,
  ahora igual responde en vez de devolverte un error después de esperar.
- **Sin bucle al volver a entrar**: si abrías mifik con una sesión de hace más de 30 días, la app y
  el sitio se mandaban de uno a otro sin parar. Ahora el sitio te muestra el inicio de sesión.
