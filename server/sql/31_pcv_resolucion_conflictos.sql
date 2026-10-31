-- 31_pcv_resolucion_conflictos.sql — PREPARADA, NO EJECUTADA.
-- Auditoría de correcciones de PCV derivadas de reglas versionadas (sectorial/app/tools/diagnostico_conflictos.cjs).
-- Requisitos previos: copia verificada (server/scripts/backup-db.cjs + comprobar-restauracion.cjs), recuperadores
-- que escriben en partida_contable_valor detenidos o en pausa, y aprobación explícita.
CREATE TABLE IF NOT EXISTS pcv_correccion_auditoria (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  ledger_sha256 CHAR(64) CHARACTER SET ascii NOT NULL,
  informe_id INT NOT NULL,
  concept_code VARCHAR(80) NOT NULL,
  pcv_id INT NULL,
  regla VARCHAR(60) NOT NULL,
  version_regla VARCHAR(20) NOT NULL,
  accion VARCHAR(60) NOT NULL,
  importe_anterior DECIMAL(24,4) NULL,
  importe_nuevo DECIMAL(24,4) NULL,
  evidencia_sha256 CHAR(64) CHARACTER SET ascii NOT NULL,
  aplicado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  revertido_en TIMESTAMP NULL,
  UNIQUE KEY uq_pcv_correccion (ledger_sha256, informe_id, concept_code, pcv_id),
  KEY ix_pcv_correccion_informe (informe_id, concept_code),
  CONSTRAINT fk_pcv_correccion_informe FOREIGN KEY (informe_id) REFERENCES informe_financiero(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
-- Semántica: una celda con CONFLICT_PRESERVED cuenta como certificada sólo si además tiene CONFLICT_RESOLVED de una
-- regla versionada y un resultado certificador (INSERTED / NULL_FILLED / VERIFIED_EXISTING) para el valor vigente.
