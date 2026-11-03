import type { ErrorEvent } from "@sentry/react";
import { describe, expect, it } from "vitest";

import { scrubBreadcrumb, scrubEvent, stripQuery } from "./errorScrub";

describe("stripQuery", () => {
  it("keeps the path and drops the query and the hash", () => {
    expect(stripQuery("https://app.mifik.cl/accounts/1?tab=billing&statement=2#x")).toBe(
      "https://app.mifik.cl/accounts/1",
    );
    expect(stripQuery("/transactions#top")).toBe("/transactions");
    expect(stripQuery("/transactions")).toBe("/transactions");
  });
});

describe("scrubEvent", () => {
  it("leaves no query, headers, cookies, body or user in the report", () => {
    const event = {
      type: undefined,
      request: {
        url: "https://app.mifik.cl/profile/personal?edit=email",
        headers: { Referer: "https://mifik.cl/es/reset-password/?token=secret" },
        cookies: { fik_access: "jwt" },
        query_string: "edit=email",
        data: { amount: "95000" },
      },
      user: { id: "u1", email: "a@b.cl" },
    } as unknown as ErrorEvent;

    const scrubbed = scrubEvent(event);

    expect(scrubbed.request).toEqual({ url: "https://app.mifik.cl/profile/personal" });
    expect(scrubbed.user).toBeUndefined();
  });
});

describe("scrubBreadcrumb", () => {
  it("strips the query from navigations and API calls", () => {
    expect(
      scrubBreadcrumb({
        category: "navigation",
        data: { from: "/transactions?cf=1", to: "/accounts?nueva=1" },
      }).data,
    ).toEqual({ from: "/transactions", to: "/accounts" });
    expect(
      scrubBreadcrumb({
        category: "fetch",
        data: { url: "https://api.mifik.cl/api/v1/transactions?categoryId=x", status_code: 200 },
      }).data,
    ).toEqual({ url: "https://api.mifik.cl/api/v1/transactions", status_code: 200 });
  });
});
