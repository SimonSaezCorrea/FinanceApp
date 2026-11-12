---
title: Escribir tu contraseña dentro de la app también tiene límite de intentos
summary: Los intentos con tu contraseña dentro de la app cuentan igual que al entrar.
commits:
  - f8e6ba78
---

## Seguridad

- **Límite de intentos dentro de la app**: cuando confirmas que eres tú con tu contraseña, la
  cambias, desactivas la verificación en dos pasos o eliminas tu cuenta, cada contraseña
  equivocada cuenta igual que al entrar. Tras 5 seguidas, esperas 15 minutos.
- **Cambios de seguridad que no se pisan**: cambiar tu contraseña o activar o desactivar la
  verificación en dos pasos ya no deshace otro cambio de seguridad hecho al mismo tiempo.
