-- Rollback del esquema 31 (sólo tras revertir los datos: no deben quedar correcciones sin revertido_en).
DROP TABLE IF EXISTS pcv_correccion_auditoria;
UPDATE taxonomia_concepto SET alias_edinet='CashAndDeposits' WHERE concepto_estandar='EFECTIVO' AND alias_edinet='CashAndCashEquivalents';
DELETE t FROM taxonomia_concepto t WHERE t.concepto_estandar='CAJA_Y_DEPOSITOS' AND NOT EXISTS (SELECT 1 FROM partida_contable_valor p WHERE p.concepto_estandar_id=t.id);
