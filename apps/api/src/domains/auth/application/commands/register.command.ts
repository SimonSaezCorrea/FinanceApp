import type { auth } from "@finance/contracts";

import type { SystemCommand } from "../../../../infra/cqrs/base-command.handler";

/** Precedes having a `userId` (there is no authenticated user yet) — modeled
 * as a `SystemCommand`, the same pragmatic exception `accounts`'
 * `GenerateAllDueStatementsCommand` already established for the cron trigger. */
export class RegisterCommand implements SystemCommand {
  readonly scope = "system" as const;

  constructor(public readonly input: auth.RegisterRequest) {}
}
