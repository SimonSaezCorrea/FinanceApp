# Quickstart: validar 041

## Automático

```bash
pnpm --filter @finance/contracts test
pnpm --filter @finance/api exec vitest run test/unit/domains/user test/unit/domains/authenticator-model test/unit/infra
pnpm test:integration:local test/integration/domains/authenticator-model test/integration/domains/passkey test/integration/domains/session test/e2e/domains/user
pnpm --filter @finance/web exec vitest run src/domains/profile src/i18n
pnpm typecheck && npx turbo run lint && pnpm check:boundaries
```

Los e2e no usan el catálogo real: cargan un catálogo de prueba (una entrada verificable con un
certificado de prueba y otra comprometida) en `authenticator-model` y simulan la verificación de la
librería, igual que los e2e de passkeys existentes (un autenticador real no se puede simular en un test).

## Manual

1. Con la API local y crons activos (`CRONS_ENABLED=true`), arrancar: con la tabla vacía, el log muestra
   "FIDO catalog: replaced N models (catalog #X)".
2. Perfil → Seguridad → Agregar llave con una passkey del gestor del navegador: se guarda sin modelo ni
   distintivo, igual que antes.
3. Con una llave física (YubiKey) y aceptando compartir el modelo: el nombre aparece precompletado con el
   modelo; la lista muestra "Verificada".
4. Marcar a mano en la base (`UPDATE "authenticator-model" SET "compromisedStatus" = 'REVOKED' …`) el
   modelo de esa llave y correr el paso de mantención (la revisión de llaves corre aunque no haya catálogo nuevo): la llave queda
   "Comprometida", la sesión abierta con ella se cierra y llega un correo (en local, se ve en el log).
