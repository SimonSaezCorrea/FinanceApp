import { describe, expect, it } from "vitest";

import { serially } from "../../../../../src/domains/user/application/per-key-queue";

describe("serially (security run-4)", () => {
  it("runs work for one key one at a time, in order, even when one fails", async () => {
    const log: string[] = [];
    const step =
      (name: string, ms: number, fail = false) =>
      async () => {
        log.push(`start ${name}`);
        await new Promise((r) => setTimeout(r, ms));
        log.push(`end ${name}`);
        if (fail) throw new Error(name);
        return name;
      };
    const results = await Promise.allSettled([
      serially("k", step("a", 20, true)),
      serially("k", step("b", 5)),
      serially("other", step("c", 1)),
    ]);
    expect(results.map((r) => r.status)).toEqual(["rejected", "fulfilled", "fulfilled"]);
    expect(log.indexOf("end a")).toBeLessThan(log.indexOf("start b"));
    // Another key doesn't wait.
    expect(log.indexOf("end c")).toBeLessThan(log.indexOf("end a"));
  });
});
