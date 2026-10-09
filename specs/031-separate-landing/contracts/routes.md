# Contract: direcciones y redirecciones (031)

## Sitio público (`cuadra.cl`, local `http://localhost:4321`)

| Dirección | Contenido | Notas |
|---|---|---|
| `/` | redirección | `location.replace("/en/" + search + hash)` si `navigator.languages[0]` empieza por `en`; si no `/es/…`. `<meta http-equiv="refresh" content="0;url=/es/">` para clientes sin JS. Es la `x-default`. |
| `/{lang}/` | portada | `lang ∈ {es, en}` |
| `/{lang}/about` | Nosotros | |
| `/{lang}/privacy` | Privacidad | anclas `#privacy-layer-<key>` se conservan |
| `/{lang}/pricing` | Precios | |
| `/{lang}/faq` | Preguntas | anclas `#faq-<key>` se conservan |
| `/precios` | → `/es/pricing` | página de redirección: `location.replace(dest + search + hash)` + `meta refresh` + `canonical` |
| `/nosotros` | → `/es/about` | ídem |
| `/privacidad` | → `/es/privacy` | ídem |
| `/preguntas` | → `/es/faq` | ídem |
| cualquier otra | 404 del sitio | `404.astro`, en español con enlace a ambas portadas |

En producción las redirecciones antiguas y la de la raíz deberían ser HTTP (301 para las antiguas,
302 por idioma para la raíz) configuradas en el hosting; las páginas de redirección son el respaldo
que funciona en cualquier hosting estático. Queda en `docs/PENDING.md`.

### Parámetros del panel de acceso (cualquier página de cualquier idioma)

| Parámetro | Valores | Efecto |
|---|---|---|
| `acceso` | `login` \| `registro` | abre el panel en esa pestaña al cargar |
| `volver` | ruta de la app (ver data-model) | destino tras el acceso; inválida → `/` |

Tras un acceso o registro exitoso: `location.assign(PUBLIC_APP_URL + safeReturnTo(volver))`.

## App (`app.cuadra.cl`, local `http://localhost:5173`)

| Situación | Resultado |
|---|---|
| `/` con sesión | Panel |
| `/` sin sesión | `location.replace(VITE_LANDING_URL + "/?acceso=login&volver=%2F")` |
| `/login` | `location.replace(VITE_LANDING_URL + "/?acceso=login" + volver?)` (conserva un `volver` recibido) |
| `/register` | `location.replace(VITE_LANDING_URL + "/?acceso=registro" + volver?)` |
| ruta protegida sin sesión (incluida la sesión vencida) | `location.replace(VITE_LANDING_URL + "/?acceso=login&volver=" + encodeURIComponent(pathname + search + hash))` |
| ruta inexistente sin sesión | igual que ruta protegida |
| ruta inexistente con sesión | 404 de la app (sin variante de landing) |
| cerrar sesión | `location.assign(VITE_LANDING_URL + "/")` |
| `/nosotros`, `/precios`, `/privacidad`, `/preguntas` | ya no existen en la app (404 → acceso); el sitio público tiene sus redirecciones |

La redirección va a `/` del sitio (no a `/es/`) para que la raíz elija el idioma del navegador.
