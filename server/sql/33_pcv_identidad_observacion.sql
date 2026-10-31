-- 33_pcv_identidad_observacion.sql — identidad de observación y recuperaciones idempotentes.
-- Identidad = SHA-256(informe_id | concepto_estandar_id | etiqueta de origen). El informe fija documento y periodo, por
-- lo que una recuperación repetida nunca puede escribir sobre otro ejercicio. Índice ÚNICO que admite NULL:
--  - en cada grupo idéntico existente sólo la fila más antigua recibe la identidad; los duplicados históricos se
--    conservan con NULL (nada se borra ni se modifica su importe);
--  - los cargadores nuevos escriben la identidad, de modo que repetir una recuperación actualiza la misma observación
--    (INSERT … ON DUPLICATE KEY) en vez de crear otra fila indistinguible.
-- Ensayar antes en una copia aislada (ALTER en línea, INPLACE). Rollback: 33_pcv_identidad_observacion.rollback.sql.
ALTER TABLE partida_contable_valor ADD COLUMN identidad_observacion CHAR(64) CHARACTER SET ascii NULL, ALGORITHM=INSTANT;
UPDATE partida_contable_valor p
JOIN (SELECT MIN(id) id FROM partida_contable_valor WHERE informe_id IS NOT NULL AND concepto_estandar_id IS NOT NULL GROUP BY informe_id, concepto_estandar_id, concepto) m ON m.id = p.id
SET p.identidad_observacion = SHA2(CONCAT_WS('|', p.informe_id, p.concepto_estandar_id, IFNULL(p.concepto, '')), 256)
WHERE p.identidad_observacion IS NULL;
ALTER TABLE partida_contable_valor ADD UNIQUE KEY uq_pcv_identidad_observacion (identidad_observacion), ALGORITHM=INPLACE, LOCK=NONE;
