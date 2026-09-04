import { createHmac } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  decodeCursor,
  encodeCursor,
} from "../../../../../../src/domains/transaction/application/queries/transaction-cursor";
import { InvalidCursorError } from "../../../../../../src/domains/transaction/domain/errors";

const SECRET = "test-secret";
const cursor = { occurredAt: new Date("2026-03-01T00:00:00Z"), id: "t1" };

describe("transaction-cursor", () => {
  it("round-trips a freshly encoded cursor with the same secret", () => {
    const token = encodeCursor(cursor, SECRET);
    expect(decodeCursor(token, SECRET)).toEqual(cursor);
  });

  it("rejects a cursor whose payload was tampered with", () => {
    const token = encodeCursor(cursor, SECRET);
    const [payload, mac] = token.split(".");
    const tampered = `${payload}x.${mac}`;
    expect(() => decodeCursor(tampered, SECRET)).toThrow(InvalidCursorError);
  });

  it("rejects a cursor whose MAC was tampered with", () => {
    const token = encodeCursor(cursor, SECRET);
    const [payload, mac] = token.split(".");
    const tampered = `${payload}.${mac}x`;
    expect(() => decodeCursor(tampered, SECRET)).toThrow(InvalidCursorError);
  });

  it("rejects a cursor of a version other than the current one, even with a valid MAC for that payload", () => {
    // Hand-build a "future version" cursor, correctly signed for ITS OWN payload.
    const payload = `9|${cursor.occurredAt.toISOString()}|${cursor.id}`;
    const mac = createHmac("sha256", SECRET).update(payload).digest().toString("base64url");
    const token = `${Buffer.from(payload, "utf8").toString("base64url")}.${mac}`;
    expect(() => decodeCursor(token, SECRET)).toThrow(InvalidCursorError);
  });

  it("rejects a cursor missing the separator, or with more than one", () => {
    expect(() => decodeCursor("no-dot-here", SECRET)).toThrow(InvalidCursorError);
    expect(() => decodeCursor("a.b.c", SECRET)).toThrow(InvalidCursorError);
  });

  it("rejects the old pre-signing unsigned encoding", () => {
    const legacy = Buffer.from(`${cursor.occurredAt.toISOString()}|${cursor.id}`, "utf8").toString(
      "base64url",
    );
    expect(() => decodeCursor(legacy, SECRET)).toThrow(InvalidCursorError);
  });

  it("never validates a cursor issued with a different secret", () => {
    const token = encodeCursor(cursor, SECRET);
    expect(() => decodeCursor(token, "another-secret")).toThrow(InvalidCursorError);
  });
});
