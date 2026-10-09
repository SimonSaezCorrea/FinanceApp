import { describe, expect, it } from "vitest";

import { landingAccessUrl, landingHomeUrl } from "./landingUrl";

const LANDING = (import.meta.env.VITE_LANDING_URL ?? "http://localhost:4321").replace(/\/+$/, "");

describe("landingUrl", () => {
  it("opens the public site's access panel and remembers the path to come back to", () => {
    expect(landingAccessUrl("login", "/accounts/1?tab=x")).toBe(
      `${LANDING}/?acceso=login&volver=%2Faccounts%2F1%3Ftab%3Dx`,
    );
    expect(landingAccessUrl("register")).toBe(`${LANDING}/?acceso=registro`);
  });

  it("drops a return path that isn't this app's, or is just the Panel", () => {
    expect(landingAccessUrl("login", "//evil.com")).toBe(`${LANDING}/?acceso=login`);
    expect(landingAccessUrl("login", "/")).toBe(`${LANDING}/?acceso=login`);
  });

  it("points home at the public site's root", () => {
    expect(landingHomeUrl()).toBe(`${LANDING}/`);
  });
});
