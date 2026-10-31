-- Rollback de la migración 33 (sólo quita la columna de identidad y su índice; no toca importes).
ALTER TABLE partida_contable_valor DROP INDEX uq_pcv_identidad_observacion;
ALTER TABLE partida_contable_valor DROP COLUMN identidad_observacion;
