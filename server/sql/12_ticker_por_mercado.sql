-- PROPUESTA separada: comprobar nulls, importadores y relaciones antes de autorizar.
SELECT ticker,mercado_id,COUNT(*) n FROM instrumento GROUP BY ticker,mercado_id HAVING COUNT(*)>1;
ALTER TABLE instrumento ADD UNIQUE KEY uq_instrumento_mercado_ticker (mercado_id,ticker), DROP INDEX ticker;
-- Reversión SOLO si no hay tickers repetidos globalmente:
-- SELECT ticker,COUNT(*) n FROM instrumento GROUP BY ticker HAVING COUNT(*)>1;
-- ALTER TABLE instrumento ADD UNIQUE KEY ticker (ticker), DROP INDEX uq_instrumento_mercado_ticker;
