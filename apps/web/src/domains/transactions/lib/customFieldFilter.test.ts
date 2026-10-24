import { describe, expect, it } from "vitest";

import { filterFromSearchParams, toApiFilter, writeSearchParams } from "./customFieldFilter";

describe("custom field filter in the URL (specs/036)", () => {
  it("round-trips every predicate through the query string", () => {
    for (const query of [
      "cf=f1&cfv=false",
      "cf=f1&cfEmpty=true",
      "cf=f1&cfHasValue=true",
      "cf=f1&cfText=jap",
      "cf=f1&cfMin=10&cfMax=20",
    ]) {
      const filter = filterFromSearchParams(new URLSearchParams(query));
      const params = new URLSearchParams("from=x");
      writeSearchParams(params, filter);
      expect(params.get("from")).toBe("x");
      params.delete("from");
      expect(params.toString()).toBe(query);
    }
  });

  it("no field, no filter; an incomplete predicate means 'has a value'", () => {
    expect(filterFromSearchParams(new URLSearchParams("cfv=true"))).toBeUndefined();
    expect(toApiFilter({ fieldId: "f1", mode: "text", text: "  " })).toEqual({
      cf: "f1",
      cfHasValue: "true",
    });
    expect(toApiFilter({ fieldId: "f1", mode: "range", min: "", max: "5" })).toEqual({
      cf: "f1",
      cfMin: undefined,
      cfMax: "5",
    });
  });
});
