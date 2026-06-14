import "reflect-metadata";
import { Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import cookieParser from "cookie-parser";

import { AppModule } from "./app.module";
import { AllExceptionsFilter } from "./infra/http/all-exceptions.filter";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);

  app.setGlobalPrefix("api/v1");
  app.use(cookieParser());
  // Request validation is done with zod (packages/contracts) via per-domain pipes (US2),
  // not Nest's class-validator ValidationPipe.
  app.useGlobalFilters(new AllExceptionsFilter());

  const webOrigin = config.get<string>("CORS_ORIGIN") ?? "http://localhost:5173";
  app.enableCors({ origin: webOrigin, credentials: true });

  const port = config.get<number>("PORT") ?? 3001;
  await app.listen(port);
  Logger.log(`API listening on http://localhost:${port}/api/v1`, "Bootstrap");
}

void bootstrap();
