import { PrismaPg } from "@prisma/adapter-pg";
import { Injectable, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaClient } from "@prisma/client";

import { assertProductionDatabaseOnlyInProduction } from "../config/production-database";

/** The single database client for the whole API (Constitution Principle II / FR-012). */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor(config: ConfigService) {
    const url = config.getOrThrow<string>("DATABASE_URL");
    // A local API must never write to the production database (see production-database.ts).
    assertProductionDatabaseOnlyInProduction([url], config.get<string>("NODE_ENV"), "the API");
    super({ adapter: new PrismaPg({ connectionString: url }) });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
