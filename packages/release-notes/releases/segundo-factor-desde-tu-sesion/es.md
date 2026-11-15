---
title: Activar la verificación en dos pasos solo se termina donde la empezaste
summary: Una configuración a medias ya no se puede completar desde otra sesión, y los códigos tienen límite.
commits:
  - c99cb94e
  - 42ac62d0
---

## Seguridad

- **Solo desde tu sesión**: si empiezas a activar la verificación en dos pasos, solo se puede
  terminar desde la misma sesión y dentro de 30 minutos. Pasado ese tiempo, se empieza de nuevo.
- **Límite de códigos al activarla**: tras 5 códigos equivocados seguidos, esperas 15 minutos
  antes de volver a intentarlo.
- **Tu inicio de sesión no se bloquea por otros**: los códigos equivocados al confirmar que eres
  tú dentro de la app cuentan aparte y ya no bloquean tu entrada con el segundo factor.
- **Sin atajos en paralelo**: varios intentos de código enviados a la vez cuentan todos, así que
  el límite de 5 se cumple siempre.
- **Plantillas de tamaño razonable**: una plantilla de importación puede generar hasta 20.000
  cuotas en total entre todos sus planes.
