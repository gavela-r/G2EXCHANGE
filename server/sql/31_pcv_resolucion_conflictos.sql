-- 31_pcv_resolucion_conflictos.sql
-- Auditoría de correcciones de PCV derivadas de reglas versionadas (sectorial/app/tools/diagnostico_conflictos.cjs).
-- Requisitos previos de los datos: copia verificada, ensayo y rollback en una copia aislada, y pausa de los procesos
-- que escriben partida_contable_valor durante la aplicación.
CREATE TABLE IF NOT EXISTS pcv_correccion_auditoria (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  ledger_sha256 CHAR(64) CHARACTER SET ascii NOT NULL,
  informe_id INT NOT NULL,
  concept_code VARCHAR(80) NOT NULL,
  pcv_id INT NOT NULL DEFAULT 0,
  regla VARCHAR(60) NOT NULL,
  version_regla VARCHAR(20) NOT NULL,
  accion VARCHAR(60) NOT NULL,
  importe_anterior DECIMAL(24,4) NULL,
  importe_nuevo DECIMAL(24,4) NULL,
  concepto_anterior_id BIGINT UNSIGNED NULL,
  concepto_nuevo_id BIGINT UNSIGNED NULL,
  conflicto_evidence_hash CHAR(64) CHARACTER SET ascii NOT NULL,
  aplicado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  revertido_en TIMESTAMP NULL,
  -- Sin clave única: la idempotencia la garantizan los UPDATE condicionados (importe antiguo) y la clave única de las
  -- evidencias; así una reaplicación tras un rollback vuelve a quedar auditada.
  KEY ix_pcv_correccion_ledger (ledger_sha256, informe_id, concept_code),
  KEY ix_pcv_correccion_pcv (pcv_id),
  CONSTRAINT fk_pcv_correccion_informe FOREIGN KEY (informe_id) REFERENCES informe_financiero(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
-- Concepto independiente para «現金及び預金» (no equivale a efectivo y equivalentes). EFECTIVO pasa a
-- definirse como efectivo y equivalentes también en EDINET.
INSERT IGNORE INTO taxonomia_concepto(concepto_estandar,categoria,alias_edinet,descripcion,unidad_tipo,activo,signo_esperado)
VALUES('CAJA_Y_DEPOSITOS','BALANCE','CashAndDeposits','Caja y depósitos (現金及び預金); incluye depósitos a plazo. No equivale a efectivo y equivalentes.','MONEDA',1,'POSITIVO');
UPDATE taxonomia_concepto SET alias_edinet='CashAndCashEquivalents' WHERE concepto_estandar='EFECTIVO' AND alias_edinet='CashAndDeposits';
-- Semántica: una celda con CONFLICT_PRESERVED deja de bloquear sólo si un CONFLICT_RESOLVED de una regla versionada
-- referencia ese conflicto (resolves = evidence_hash) y además existe una prueba certificadora para el valor vigente.
