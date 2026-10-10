import { afterEach, describe, expect, it } from "vitest";

import { configureClient, getBaseUrl } from "./config";

describe("configureClient", () => {
  afterEach(() => configureClient({ baseUrl: undefined }));

  it("drops every trailing slash", () => {
    configureClient({ baseUrl: " https://api.mifik.cl/// " });
    expect(getBaseUrl()).toBe("https://api.mifik.cl");
  });

  it("keeps the local dev server when nothing is configured", () => {
    configureClient({ baseUrl: "   " });
    expect(getBaseUrl()).toBe("http://localhost:3001");
  });

  it("handles a long run of slashes in linear time", () => {
    configureClient({ baseUrl: `https://x${"/".repeat(100_000)}` });
    expect(getBaseUrl()).toBe("https://x");
  });
});
