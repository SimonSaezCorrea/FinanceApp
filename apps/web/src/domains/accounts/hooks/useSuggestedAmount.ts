import { useState } from "react";

import { exchangeRates } from "@finance/contracts";
import { convertAmount } from "@finance/money";

import { useRateOn } from "../../exchange-rates/hooks/useExchangeRates";

interface Params {
  /** The amount the suggestion is derived from, in `fromCurrency` (the BASE figure). */
  amount: string;
  fromCurrency: string;
  toCurrency: string;
  /** `YYYY-MM-DD` the operation is dated with — the rate of THAT day applies, not today's. */
  date: string;
}

export interface Suggestion {
  rate: string;
  /** The day the rate row answers for. */
  rateDate: string;
  /** The day the source actually published it; earlier than `rateDate` when carried. */
  valueDate: string;
  carried: boolean;
}

/**
 * The derived half of the suggestion (spec 030): what `amount` in `fromCurrency` is worth in
 * `toCurrency` at the rate of `date`, and which rate that was — with no state of its own, for a
 * caller that keeps the person's edit somewhere else (a form value).
 *
 * Only USD → CLP is suggested. Nothing is returned (null) when no rate is recorded, the amount
 * is not positive, or the pair is any other: the person then types the amount as always.
 */
export function useAmountSuggestion({ amount, fromCurrency, toCurrency, date }: Params): {
  suggested: string | null;
  suggestion: Suggestion | null;
  /** Whether this pair is estimated at all (USD → CLP). */
  supported: boolean;
  /** Supported, and the lookup finished with NO recorded rate: the caller says so. */
  noRate: boolean;
} {
  const supported = fromCurrency === "USD" && toCurrency === "CLP";
  const { rate, isLoading } = useRateOn("USD", date, { enabled: supported });
  const noRate = supported && !isLoading && !rate;

  const clean = amount.endsWith(".") ? amount.slice(0, -1) : amount;
  const positive = Number(clean) > 0;
  if (!supported || !rate || !positive) {
    return { suggested: null, suggestion: null, supported, noRate };
  }
  return {
    supported,
    noRate,
    suggested: convertAmount(clean, rate.value, "CLP"),
    suggestion: {
      rate: rate.value,
      rateDate: rate.date,
      valueDate: rate.valueDate,
      carried: exchangeRates.isCarried(rate),
    },
  };
}

/**
 * Spec 030: an EDITABLE conversion proposal for the other side of a USD→CLP operation (a USD
 * statement payment). The amount typed in `fromCurrency` is always the base: the returned
 * `value` is its estimate in `toCurrency` until the person types their own, and it never
 * flows the other way — editing the pesos can never change the dollars.
 *
 * Nothing is suggested (empty `value`, null `suggestion`) when there is no recorded rate, no
 * positive amount, or the pair is not USD→CLP; the person then types the amount as always.
 */
export function useSuggestedAmount(params: Params) {
  const { suggested, suggestion, noRate } = useAmountSuggestion(params);
  const [typed, setTyped] = useState<string | null>(null);

  return {
    /** The pair is estimated, but no rate is recorded for the date: say so. */
    noRate,
    /** What the field shows: the person's own text once they edit, the estimate before. */
    value: typed ?? suggested ?? "",
    /** Marks the field as the person's own; clearing it counts (they are about to retype). */
    setValue: (next: string) => setTyped(next),
    /** Back to following the estimate. */
    reset: () => setTyped(null),
    edited: typed !== null,
    suggestion,
  };
}
