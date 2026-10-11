# Política de seguridad / Security policy

_English below._

**fik** guarda datos financieros personales, así que tomamos en serio cualquier reporte de
seguridad. Gracias por avisarnos de forma responsable.

## Qué cubre

- El sitio público: `https://mifik.cl`
- La app: `https://app.mifik.cl`
- El API: `https://api.mifik.cl`
- El código de este repositorio.

Solo se mantiene la versión en producción (la rama `main`).

## Cómo reportar

**No abras un issue público.** Usa una de estas vías privadas:

1. **GitHub:** pestaña _Security_ → **Report a vulnerability**
   ([enlace directo](https://github.com/SimonSaezCorrea/FinanceApp/security/advisories/new)).
2. **Correo:** `contacto@mifik.cl`, con el asunto "Seguridad".

Incluye, si puedes: qué encontraste, dónde (URL o archivo), pasos para reproducirlo, el impacto que
crees que tiene y, si aplica, una prueba de concepto mínima.

## Qué esperar

fik es un proyecto mantenido por una sola persona, así que los plazos son honestos, no
corporativos:

- **Acuse de recibo:** dentro de 5 días hábiles.
- **Evaluación inicial:** dentro de 10 días hábiles, con la gravedad que le asignamos.
- **Corrección:** lo antes posible según la gravedad; los problemas que expongan datos de usuarios
  tienen prioridad sobre todo lo demás.
- Te mantenemos al tanto, y si quieres te damos crédito en el aviso de seguridad.

No hay un programa de recompensas en dinero.

## Investigación de buena fe

No tomaremos acciones contra quien investigue de buena fe y respete estas reglas:

- Prueba **solo con tus propias cuentas**. Nunca accedas, modifiques ni borres datos de otras
  personas; si por error llegas a datos ajenos, detente, no los guardes y avísanos.
- Nada de denegación de servicio, pruebas de carga, spam, ingeniería social ni ataques físicos.
- No uses herramientas automatizadas que generen tráfico masivo.
- Danos un plazo razonable (90 días) para corregir antes de hacer público el hallazgo.

**Fuera de alcance:** vulnerabilidades de los proveedores (AWS, Cloudflare, Resend, IPinfo):
repórtalas a ellos; reportes sin impacto demostrable (por ejemplo, cabeceras faltantes en páginas
públicas sin datos, versiones de software sin un ataque concreto); ataques que requieran un
dispositivo ya comprometido.

---

## English

**fik** stores personal financial data, so we take every security report seriously. Thank you for
disclosing responsibly.

**Scope:** `https://mifik.cl`, `https://app.mifik.cl`, `https://api.mifik.cl` and the code in this
repository. Only the production version (branch `main`) is maintained.

**How to report** (please **do not open a public issue**):

1. **GitHub:** _Security_ tab → **Report a vulnerability**
   ([direct link](https://github.com/SimonSaezCorrea/FinanceApp/security/advisories/new)).
2. **Email:** `contacto@mifik.cl`, subject "Security".

Include what you found, where, steps to reproduce, the impact you expect and, if relevant, a minimal
proof of concept.

**What to expect** (a one-person project, so honest timelines): acknowledgement within 5 business
days, initial assessment within 10, a fix as soon as the severity calls for (anything exposing user
data comes first), updates along the way and credit in the advisory if you want it. There is no
monetary bounty.

**Good-faith research:** we will not act against good-faith research that tests **only your own
accounts**, never accesses, changes or deletes other people's data (if you reach it by accident,
stop, don't keep it and tell us), avoids denial of service, load testing, spam, social engineering
and mass automated traffic, and gives us a reasonable time (90 days) before disclosure.

**Out of scope:** vulnerabilities in our providers (AWS, Cloudflare, Resend, IPinfo), which should
be reported to them; reports without a demonstrable impact; attacks that require an already
compromised device.
