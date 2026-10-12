import type { UserScopedCommand } from "../../../../infra/cqrs/base-command.handler";

/** `writtenOff: true` gives up on what is still pending ("no se pagará");
 * `false` reinstates it. */
export class WriteOffDebtCommand implements UserScopedCommand {
  readonly scope = "user" as const;

  constructor(
    public readonly userId: string,
    public readonly id: string,
    public readonly writtenOff: boolean,
  ) {}
}
