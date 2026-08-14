import { describe, expect, it } from "vitest";

import { panelNavigation } from "./panelNavigation";

describe("panelNavigation", () => {
  it("reports the 1-based position against the whole filtered set", () => {
    const nav = panelNavigation({ index: 2, loaded: 20, total: 137, hasNextPage: true });
    expect(nav.position).toBe(3);
    expect(nav.count).toBe(137);
  });

  it("falls back to the loaded count when the total is unknown", () => {
    expect(panelNavigation({ index: 0, loaded: 5, hasNextPage: false }).count).toBe(5);
  });

  it("disables ‹ on the first movement", () => {
    const nav = panelNavigation({ index: 0, loaded: 5, hasNextPage: false });
    expect(nav.canGoPrevious).toBe(false);
    expect(nav.previousIndex).toBeNull();
  });

  it("disables › on the last movement of the last page", () => {
    const nav = panelNavigation({ index: 4, loaded: 5, hasNextPage: false });
    expect(nav.canGoNext).toBe(false);
    expect(nav.nextIndex).toBeNull();
    expect(nav.needsMore).toBe(false);
  });

  it("signals that more has to be loaded at the end of a page", () => {
    const nav = panelNavigation({ index: 19, loaded: 20, total: 137, hasNextPage: true });
    expect(nav.canGoNext).toBe(true);
    expect(nav.nextIndex).toBeNull();
    expect(nav.needsMore).toBe(true);
  });

  it("moves within the loaded set without fetching", () => {
    const nav = panelNavigation({ index: 3, loaded: 20, hasNextPage: true });
    expect(nav.nextIndex).toBe(4);
    expect(nav.previousIndex).toBe(2);
    expect(nav.needsMore).toBe(false);
  });
});
