import { describe, expect, it } from "vitest";

import { APP_URL } from "./config";
import { appUrl } from "./returnTo";

describe("appUrl", () => {
  it("lands on the requested path inside the app", () => {
    expect(appUrl("/accounts/1?tab=billing")).toBe(`${APP_URL}/accounts/1?tab=billing`);
  });

  it("lands on the Panel when the path is missing or points outside the app", () => {
    expect(appUrl(null)).toBe(`${APP_URL}/`);
    expect(appUrl("//evil.com")).toBe(`${APP_URL}/`);
    expect(appUrl("https://evil.com")).toBe(`${APP_URL}/`);
  });
});
