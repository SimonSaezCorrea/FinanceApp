import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

/**
 * Whether the scheduled jobs (`infra/cron`) run in this process. Same rule as real email
 * delivery: ON in production, OFF anywhere else, so a local API (or one pointed at another
 * database by mistake) never sweeps sessions, closes statements or records exchange rates on its
 * own. `CRONS_ENABLED=true|false` overrides it either way — e.g. `true` in a local `.env` to fill
 * the exchange rates of a development database. Any other value fails at boot.
 */
export function cronsEnabled(config: Pick<ConfigService, "get">): boolean {
  const raw = config.get<string>("CRONS_ENABLED")?.trim().toLowerCase();
  if (raw === "true") return true;
  if (raw === "false") return false;
  if (raw) throw new Error(`CRONS_ENABLED must be "true" or "false" (got "${raw}")`);
  return config.get<string>("NODE_ENV") === "production";
}

/** The decision above, taken once at boot and shared by every cron trigger. */
@Injectable()
export class CronSwitch {
  readonly enabled: boolean;

  constructor(config: ConfigService) {
    this.enabled = cronsEnabled(config);
    if (!this.enabled) {
      new Logger(CronSwitch.name).log(
        "Scheduled jobs are OFF (not production; set CRONS_ENABLED=true to run them)",
      );
    }
  }
}
