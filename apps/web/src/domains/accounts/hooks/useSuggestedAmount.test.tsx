import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useSuggestedAmount } from "./useSuggestedAmount";

const list = vi.fn();
vi.mock("../../exchange-rates/api/exchangeRatesApi", () => ({
  exchangeRatesApi: { list: (...args: unknown[]) => list(...args) },
}));

const usd = (date: string, value: string, valueDate = date) => ({
  currency: "USD" as const,
  date,
  value,
  valueDate,
});

function respondWith(items: ReturnType<typeof usd>[]) {
  list.mockResolvedValue({ items, latest: { USD: items[0] ?? null, CLF: null } });
}

function wrapper({ children }: Readonly<{ children: ReactNode }>) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const props = {
  amount: "100",
  fromCurrency: "USD",
  toCurrency: "CLP",
  date: "2026-10-08",
};

describe("useSuggestedAmount", () => {
  beforeEach(() => list.mockReset());

  it("suggests the dollars times the rate of the payment date", async () => {
    respondWith([usd("2026-10-08", "950")]);
    const { result } = renderHook(() => useSuggestedAmount(props), { wrapper });

    await waitFor(() => expect(result.current.value).toBe("95000"));
    expect(result.current.suggestion?.rateDate).toBe("2026-10-08");
    expect(result.current.suggestion?.carried).toBe(false);
    expect(result.current.edited).toBe(false);
  });

  it("flags a carried rate and reports the day it was published", async () => {
    respondWith([usd("2026-10-08", "950", "2026-10-06")]);
    const { result } = renderHook(() => useSuggestedAmount(props), { wrapper });

    await waitFor(() => expect(result.current.value).toBe("95000"));
    expect(result.current.suggestion?.carried).toBe(true);
    expect(result.current.suggestion?.valueDate).toBe("2026-10-06");
  });

  it("re-suggests while the pesos are untouched when the dollars change", async () => {
    respondWith([usd("2026-10-08", "950")]);
    const { result, rerender } = renderHook((p) => useSuggestedAmount(p), {
      wrapper,
      initialProps: props,
    });
    await waitFor(() => expect(result.current.value).toBe("95000"));

    rerender({ ...props, amount: "50.41" });

    await waitFor(() => expect(result.current.value).toBe("47890"));
  });

  it("stops suggesting once the pesos are edited, and NEVER touches the dollars", async () => {
    respondWith([usd("2026-10-08", "950")]);
    const { result, rerender } = renderHook((p) => useSuggestedAmount(p), {
      wrapper,
      initialProps: props,
    });
    await waitFor(() => expect(result.current.value).toBe("95000"));

    act(() => result.current.setValue("96000"));
    expect(result.current.value).toBe("96000");
    expect(result.current.edited).toBe(true);

    rerender({ ...props, amount: "200" });
    expect(result.current.value).toBe("96000");
  });

  it("treats clearing the field as an edit (the person is about to type another number)", async () => {
    respondWith([usd("2026-10-08", "950")]);
    const { result } = renderHook(() => useSuggestedAmount(props), { wrapper });
    await waitFor(() => expect(result.current.value).toBe("95000"));

    act(() => result.current.setValue(""));

    expect(result.current.value).toBe("");
    expect(result.current.edited).toBe(true);
  });

  it("reset() goes back to following the suggestion", async () => {
    respondWith([usd("2026-10-08", "950")]);
    const { result } = renderHook(() => useSuggestedAmount(props), { wrapper });
    await waitFor(() => expect(result.current.value).toBe("95000"));
    act(() => result.current.setValue("1"));

    act(() => result.current.reset());

    expect(result.current.value).toBe("95000");
    expect(result.current.edited).toBe(false);
  });

  it("uses the rate of the chosen date, not today's", async () => {
    respondWith([usd("2026-10-08", "950"), usd("2026-10-01", "900")]);
    const { result } = renderHook(() => useSuggestedAmount({ ...props, date: "2026-10-01" }), {
      wrapper,
    });

    await waitFor(() => expect(result.current.value).toBe("90000"));
  });

  it("suggests nothing when no rate is recorded", async () => {
    respondWith([]);
    const { result } = renderHook(() => useSuggestedAmount(props), { wrapper });

    await waitFor(() => expect(list).toHaveBeenCalled());
    expect(result.current.value).toBe("");
    expect(result.current.suggestion).toBeNull();
  });

  it.each([
    ["same currency", { fromCurrency: "CLP", toCurrency: "CLP" }],
    ["the reverse direction", { fromCurrency: "CLP", toCurrency: "USD" }],
    ["an empty amount", { amount: "" }],
    ["a zero amount", { amount: "0" }],
    ["an unknown currency pair", { fromCurrency: "EUR", toCurrency: "CLP" }],
  ])("suggests nothing for %s", async (_label, override) => {
    respondWith([usd("2026-10-08", "950")]);
    const { result } = renderHook(() => useSuggestedAmount({ ...props, ...override }), { wrapper });

    await new Promise((r) => setTimeout(r, 30));
    expect(result.current.value).toBe("");
    expect(result.current.suggestion).toBeNull();
  });
});
