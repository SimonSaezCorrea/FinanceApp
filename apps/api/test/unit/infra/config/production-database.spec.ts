import { describe, expect, it } from "vitest";

import {
  assertProductionDatabaseOnlyInProduction,
  isProductionDatabaseUrl,
  ProductionDatabaseOutsideProductionError,
} from "../../../../src/infra/config/production-database";

const RDS =
  "postgresql://fik_app:x@fik-db.abc123.us-east-2.rds.amazonaws.com:5432/fik?sslmode=verify-full";
const LOCAL = "postgresql://finance:finance@localhost:5432/finance";

describe("isProductionDatabaseUrl", () => {
  it("recognises an Amazon RDS endpoint and nothing else", () => {
    expect(isProductionDatabaseUrl(RDS)).toBe(true);
    expect(
      isProductionDatabaseUrl(` ${RDS.toUpperCase().replace("POSTGRESQL", "postgresql")} `),
    ).toBe(true);
    expect(isProductionDatabaseUrl(LOCAL)).toBe(false);
    expect(isProductionDatabaseUrl("postgresql://ci:ci@postgres:5432/ci")).toBe(false);
    expect(isProductionDatabaseUrl("postgresql://u:p@rds.amazonaws.com.evil.cl/x")).toBe(false);
    expect(isProductionDatabaseUrl(undefined)).toBe(false);
    expect(isProductionDatabaseUrl("not a url")).toBe(false);
  });
});

describe("assertProductionDatabaseOnlyInProduction", () => {
  it("refuses the production database outside production", () => {
    for (const env of [undefined, "development", "test"]) {
      expect(() => assertProductionDatabaseOnlyInProduction([RDS], env, "the API")).toThrow(
        ProductionDatabaseOutsideProductionError,
      );
    }
  });

  it("checks every URL it is given (the CLI also reads DIRECT_DATABASE_URL)", () => {
    expect(() =>
      assertProductionDatabaseOnlyInProduction([LOCAL, RDS], "development", "the Prisma CLI"),
    ).toThrow(/fik-db\.abc123\.us-east-2\.rds\.amazonaws\.com/);
  });

  it("lets production use it, and anything use a non-production database", () => {
    expect(() =>
      assertProductionDatabaseOnlyInProduction([RDS], "production", "the API"),
    ).not.toThrow();
    expect(() =>
      assertProductionDatabaseOnlyInProduction([LOCAL, undefined], "development", "the API"),
    ).not.toThrow();
  });
});
