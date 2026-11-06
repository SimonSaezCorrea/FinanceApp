import type { SystemCommand } from "../../../../infra/cqrs/base-command.handler";

/** Daily (and at boot when empty): download, verify and store the FIDO catalog (specs/041). */
export class RefreshAuthenticatorCatalogCommand implements SystemCommand {
  readonly scope = "system" as const;

  constructor(public readonly onlyIfEmpty = false) {}
}
