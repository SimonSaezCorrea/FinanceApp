import path from "node:path";
import { config as loadEnv } from "dotenv";
import { defineConfig, env } from "prisma/config";

// Prisma 7 no longer auto-loads .env for the CLI config file.
loadEnv({ path: path.join(__dirname, ".env") });

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    // Schema changes go through a direct connection when one is given (Neon's pooled URL sits
    // behind PgBouncer, which schema operations shouldn't use); the app keeps DATABASE_URL.
    url: process.env.DIRECT_DATABASE_URL?.trim() || env("DATABASE_URL"),
  },
});
