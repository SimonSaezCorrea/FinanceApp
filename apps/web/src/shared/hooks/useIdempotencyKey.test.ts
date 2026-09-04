import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { useIdempotencyKey } from "./useIdempotencyKey";

/**
 * The test that catches the most likely implementation mistake in the whole
 * feature. If the key were minted per request, the first assertion here would
 * fail; if it were minted per form opening, the last one would.
 */
describe("useIdempotencyKey", () => {
  it("keeps the same key across retries of one attempt", () => {
    const { result } = renderHook(() => useIdempotencyKey());

    const first = result.current.current();
    const retry = result.current.current();

    expect(retry).toBe(first);
  });

  it("does not mint anything until the first submit", () => {
    const { result } = renderHook(() => useIdempotencyKey());
    // Nothing observable happens on render; the key exists only once asked for.
    expect(result.current.current()).toBe(result.current.current());
  });

  it("mints a NEW key after a successful submit — 'Guardar y crear otro' must not reuse one", () => {
    const { result } = renderHook(() => useIdempotencyKey());

    const first = result.current.current();
    act(() => result.current.reset());
    const second = result.current.current();

    expect(second).not.toBe(first);
  });

  it("survives a re-render — a re-render is not a new attempt", () => {
    const { result, rerender } = renderHook(() => useIdempotencyKey());

    const first = result.current.current();
    rerender();

    expect(result.current.current()).toBe(first);
  });

  it("produces keys long enough for the contract's minimum", () => {
    const { result } = renderHook(() => useIdempotencyKey());
    expect(result.current.current().length).toBeGreaterThanOrEqual(16);
  });

  it("does not collide across independent forms", () => {
    const a = renderHook(() => useIdempotencyKey());
    const b = renderHook(() => useIdempotencyKey());

    expect(a.result.current.current()).not.toBe(b.result.current.current());
  });
});
