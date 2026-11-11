---
title: Quitar una llave de acceso o cambiar tu RUT pide confirmar que eres tú
summary: Más cambios sensibles de tu cuenta te piden confirmar que eres tú, y entrar resiste mejor los intentos ajenos.
commits:
  - 557f506c
---

## Seguridad

- **Quitar una llave de acceso pide confirmar que eres tú**: igual que al agregarla. Al quitarla,
  también se cierran las otras sesiones que se abrieron con esa llave; la tuya sigue abierta.
- **Cambiar tu RUT también lo pide**: es con lo que entras y recuperas tu contraseña, así que ahora
  confirmas antes de cambiarlo, te avisamos por correo y ya no se puede dejar vacío.
- **Bloqueos más justos al entrar**: cuando termina un bloqueo por contraseñas equivocadas, la cuenta
  parte de cero, así nadie puede mantenerla bloqueada con un intento de vez en cuando.
- **Ajustes que no pisan tu seguridad**: guardar tu perfil o tus preferencias ya no deshace un
  cambio de seguridad hecho al mismo tiempo en otro dispositivo.
