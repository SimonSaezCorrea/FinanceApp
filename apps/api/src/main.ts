import "reflect-metadata";
import { Logger, type LogLevel } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import cookieParser from "cookie-parser";

import { AppModule } from "./app.module";
import { registerArtificialDelay } from "./infra/http/artificial-delay.interceptor";
import { AllExceptionsFilter } from "./infra/http/all-exceptions.filter";
import { useCompression } from "./infra/http/compression";
import { useCors } from "./infra/http/cors";
import { useJsonBodyLimit } from "./infra/http/body-limit";
import { useNoIndex } from "./infra/http/no-index";
import { useTrustProxy } from "./infra/http/trust-proxy";

/**
 * Production logs only what someone should read: errors, warnings (every failed command/query)
 * and the normal messages (boot, exchange rates, the nightly sweeps). The per-request "ok in N ms"
 * lines are `debug` and stay out — on 2026-10-11 they buried everything else, one per health
 * check. Anywhere else, every level. `LOG_LEVEL=debug` (a Parameter Store /fik/prod/LOG_LEVEL
 * parameter in production, then a deploy) brings them back while investigating something.
 */
function logLevels(nodeEnv: string | undefined, override: string | undefined): LogLevel[] {
  const all: LogLevel[] = ["fatal", "error", "warn", "log", "debug", "verbose"];
  const wanted = override?.trim().toLowerCase() || (nodeEnv === "production" ? "log" : "verbose");
  const index = all.indexOf(wanted as LogLevel);
  return index === -1 ? all : all.slice(0, index + 1);
}

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: logLevels(process.env.NODE_ENV, process.env.LOG_LEVEL),
  });
  const config = app.get(ConfigService);

  // Behind Cloudflare + Railway: read the visitor's IP, not the last proxy's (TRUST_PROXY_HOPS).
  useTrustProxy(app, config);
  useNoIndex(app);
  app.setGlobalPrefix("api/v1");
  useCompression(app);
  app.use(cookieParser());
  useJsonBodyLimit(app);
  // Request validation is done with zod (packages/contracts) via per-domain pipes (US2),
  // not Nest's class-validator ValidationPipe.
  app.useGlobalFilters(new AllExceptionsFilter());
  // Dev-only: simulates production latency so loading states are testable locally.
  registerArtificialDelay(app, config);

  // The public site and the app (CORS_ORIGIN, comma-separated) — specs/031.
  useCors(app);

  // Zero-downtime deploys (deploy/deploy.sh): the old container gets SIGTERM only once the new one
  // is healthy. With the hooks, Nest then stops accepting connections, lets the requests in
  // progress finish and disconnects Prisma, instead of Node dying mid-request.
  app.enableShutdownHooks();

  const port = config.get<number>("PORT") ?? 3001;
  await app.listen(port);
  Logger.log(`API listening on http://localhost:${port}/api/v1`, "Bootstrap");
}

void bootstrap();
