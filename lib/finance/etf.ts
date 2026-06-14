import Decimal from "decimal.js";

import prisma from "@/lib/prisma";

/** Alpha Vantage GLOBAL_QUOTE response shape (subset). */
export type AlphaVantageGlobalQuote = {
  symbol: string;
  open: Decimal;
  high: Decimal;
  low: Decimal;
  price: Decimal;
  volume: Decimal | null;
};

const TTL_MS = 24 * 60 * 60 * 1000;

function parseGlobalQuoteJson(data: unknown): AlphaVantageGlobalQuote | null {
  if (!data || typeof data !== "object") return null;
  const root = data as Record<string, unknown>;
  const gq = root["Global Quote"] as Record<string, unknown> | undefined;
  if (!gq) return null;
  const symbol = String(gq["01. symbol"] ?? "").trim();
  if (!symbol) return null;
  const open = new Decimal(String(gq["02. open"] ?? "0"));
  const high = new Decimal(String(gq["03. high"] ?? "0"));
  const low = new Decimal(String(gq["04. low"] ?? "0"));
  const price = new Decimal(String(gq["05. price"] ?? "0"));
  const volRaw = gq["06. volume"];
  const volume =
    volRaw === undefined || volRaw === null ? null : new Decimal(String(volRaw));
  return { symbol, open, high, low, price, volume };
}

async function fetchAlphaVantageQuote(
  symbol: string,
  apiKey: string,
): Promise<AlphaVantageGlobalQuote> {
  const url = new URL("https://www.alphavantage.co/query");
  url.searchParams.set("function", "GLOBAL_QUOTE");
  url.searchParams.set("symbol", symbol);
  url.searchParams.set("apikey", apiKey);

  const res = await fetch(url.toString(), { next: { revalidate: 0 } });
  if (!res.ok) throw new Error(`Alpha Vantage HTTP ${res.status}`);
  const json: unknown = await res.json();
  const parsed = parseGlobalQuoteJson(json);
  if (!parsed) {
    const note =
      typeof json === "object" && json && "Note" in json
        ? String((json as { Note?: unknown }).Note)
        : "";
    const message =
      typeof json === "object" && json && "Error Message" in json
        ? String((json as { "Error Message"?: unknown })["Error Message"])
        : "";
    throw new Error(
      message || note || "Unexpected Alpha Vantage response for GLOBAL_QUOTE",
    );
  }
  return parsed;
}

export type GetQuoteOptions = {
  /** Skip remote fetch when fresh cache exists (default true). */
  useCache?: boolean;
};

/**
 * Read-through DB cache for ETF quotes (ETFPriceCache).
 * Policy: rows with fetchedAt within ~24h are fresh; otherwise refetch and upsert.
 */
export async function getEtfQuoteCached(
  symbol: string,
  options?: GetQuoteOptions,
): Promise<AlphaVantageGlobalQuote> {
  const normalized = symbol.trim().toUpperCase();
  const useCache = options?.useCache !== false;
  const apiKey = process.env.ALPHA_VANTAGE_API_KEY;
  if (!apiKey) {
    throw new Error("ALPHA_VANTAGE_API_KEY is not configured");
  }

  const now = Date.now();

  if (useCache) {
    const cached = await prisma.etfPriceCache.findUnique({
      where: { symbol: normalized },
    });
    if (cached && now - cached.fetchedAt.getTime() < TTL_MS) {
      return {
        symbol: normalized,
        open: cached.open,
        high: cached.high,
        low: cached.low,
        price: cached.close,
        volume: cached.volume,
      };
    }
  }

  const live = await fetchAlphaVantageQuote(normalized, apiKey);

  await prisma.etfPriceCache.upsert({
    where: { symbol: normalized },
    create: {
      symbol: normalized,
      fetchedAt: new Date(now),
      open: live.open,
      high: live.high,
      low: live.low,
      close: live.price,
      volume: live.volume,
      rawJson: {},
    },
    update: {
      fetchedAt: new Date(now),
      open: live.open,
      high: live.high,
      low: live.low,
      close: live.price,
      volume: live.volume,
      rawJson: {},
    },
  });

  return live;
}
