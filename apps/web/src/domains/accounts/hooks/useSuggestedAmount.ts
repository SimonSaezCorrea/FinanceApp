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
 * Spec 030: an EDITABLE conversion proposal for the other side of a USD→CLP operation (a USD
 * statement payment, a transfer). The amount typed in `fromCurrency` is always the base: the
 * returned `value` is its estimate in `toCurrency` until the person types their own, and it
 * never flows the other way — editing the pesos can never change the dollars.
 *
 * Nothing is suggested (empty `value`, null `suggestion`) when there is no recorded rate, no
 * positive amount, or the pair is not USD→CLP; the person then types the amount as always.
 */
export function useSuggestedAmount({ amount, fromCurrency, toCurrency, date }: Params) {
  const supported = fromCurrency === "USD" && toCurrency === "CLP";
  const { rate } = useRateOn("USD", date, { enabled: supported });
  const [typed, setTyped] = useState<string | null>(null);

  const positive = Number(amount) > 0;
  const suggested =
    supported && rate && positive ? convertAmount(amount, rate.value, toCurrency) : null;
  const suggestion: Suggestion | null =
    suggested !== null && rate
      ? {
          rate: rate.value,
          rateDate: rate.date,
          valueDate: rate.valueDate,
          carried: exchangeRates.isCarried(rate),
        }
      : null;

  return {
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
