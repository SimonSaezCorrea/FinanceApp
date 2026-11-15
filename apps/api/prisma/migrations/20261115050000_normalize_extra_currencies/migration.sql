-- Security run-4 (hardening): rows written before the contract capped extraCurrencies (at most
-- 10 upper-case 3-letter codes, no duplicates) are brought to that shape, so the
-- preferences update never iterates an oversized stored list. Keeps the first occurrence of each
-- code in its original order. Data only; idempotent.
UPDATE "user" AS u
SET "extraCurrencies" = COALESCE((
  SELECT array_agg(x.code ORDER BY x.pos)
  FROM (
    SELECT upper(btrim(t.c)) AS code, min(t.ord) AS pos
    FROM unnest(u."extraCurrencies") WITH ORDINALITY AS t(c, ord)
    WHERE upper(btrim(t.c)) ~ '^[A-Z]{3}$'
    GROUP BY upper(btrim(t.c))
    ORDER BY min(t.ord)
    LIMIT 10
  ) AS x
), ARRAY[]::TEXT[])
WHERE cardinality(u."extraCurrencies") > 0;
