# HTTP contract: 041 passkey attestation

All under `/api/v1/auth`. Schemas in `@finance/contracts` (`auth`). Errors `{ error: { code, field? } }`.

## Changed

### `Passkey` (list, register-verify response)

Adds (additive; older clients ignore them):

```ts
{
  status: "unverified" | "verified" | "compromised";
  authenticatorName: string | null; // model per the FIDO catalog, only when verified/compromised
  compromisedAt: string | null;
}
```

### `POST /me/passkeys/register-options`

Same response; the options now ask for `attestation: "direct"`.

### `POST /me/passkeys/register-verify`

Same body `{ name, response }`. New error **`PASSKEY_AUTHENTICATOR_COMPROMISED`** (409): the
authenticator's verified model is compromised in the catalog; nothing is saved. An attestation that
can't be verified never fails here (saved as `unverified`).

### `POST /login/passkey-verify` and `POST /sessions/step-up/passkey-verify`

New error **`PASSKEY_COMPROMISED`** (403) when the credential belongs to a passkey marked compromised.
A successful passkey login records the passkey on the new session.

### `GET /me` / step-up methods

`stepUpMethodsFor` counts only usable (non-compromised) passkeys.

## New

| Method & path                           | Auth    | Body / response                                      | Idempotency (VII)                                  |
| --------------------------------------- | ------- | ---------------------------------------------------- | -------------------------------------------------- |
| `POST /me/passkeys/register-suggestion` | session | `{ response }` → `{ suggestedName: string \| null }` | read only: no write, the challenge is not consumed |

## Background (no HTTP)

Daily maintenance step "FIDO catalog": download + verify + replace (form (b): replace only when the
catalog number is greater), then mark passkeys (form (a): conditional update `compromisedAt IS NULL`),
close their sessions and send `PASSKEY_COMPROMISED` notices only for rows this run marked.

## Error codes (new)

`PASSKEY_AUTHENTICATOR_COMPROMISED`, `PASSKEY_COMPROMISED` — each with `errors.<CODE>` in es/en.
