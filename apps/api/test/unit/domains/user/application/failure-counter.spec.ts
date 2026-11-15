import { describe, expect, it } from "vitest";

import { FailureCounter } from "../../../../../src/domains/user/application/failure-counter";

describe("FailureCounter.reserve", () => {
  it("lets at most `threshold` attempts in before any of them is settled", () => {
    const counter = new FailureCounter(5, 15);
    // Parallel requests reserve before awaiting anything: the sixth is refused up front.
    const granted = Array.from({ length: 8 }, () => counter.reserve("u"));
    expect(granted).toEqual([true, true, true, true, true, false, false, false]);
    expect(counter.isLocked("u")).toBe(true);
  });

  it("a right code clears what was reserved", () => {
    const counter = new FailureCounter(5, 15);
    for (let i = 0; i < 4; i++) counter.reserve("u");
    expect(counter.reserve("u")).toBe(true); // the 5th locks while in flight…
    counter.reset("u"); // …and being right undoes it
    expect(counter.isLocked("u")).toBe(false);
  });

  it("a released attempt doesn't count and lifts the lock it set", () => {
    const counter = new FailureCounter(5, 15);
    for (let i = 0; i < 5; i++) counter.reserve("u");
    counter.release("u");
    expect(counter.isLocked("u")).toBe(false);
    expect(counter.reserve("u")).toBe(true);
    expect(counter.isLocked("u")).toBe(true);
  });

  it("a lock that ran out starts over", () => {
    const counter = new FailureCounter(2, 1);
    const t0 = 1_000_000;
    counter.reserve("u", t0);
    counter.reserve("u", t0);
    expect(counter.reserve("u", t0 + 1000)).toBe(false);
    expect(counter.reserve("u", t0 + 61_000)).toBe(true);
    expect(counter.isLocked("u", t0 + 61_000)).toBe(false);
  });
});
