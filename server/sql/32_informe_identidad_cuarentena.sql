-- 32_informe_identidad_cuarentena.sql
-- Identidad cruzada: documentos EDINET de emisores japoneses asignados a empresas de Taiwán por la colisión de código
-- bursátil (instrumentos taiwaneses creados en la bolsa de Tokio). Nada se borra.
CREATE TABLE IF NOT EXISTS informe_identidad_cuarentena (
  informe_id INT NOT NULL PRIMARY KEY,
  empresa_id INT NOT NULL,
  pais_empresa CHAR(2) NOT NULL,
  fuente_informe VARCHAR(40) NOT NULL,
  identificador_fuente VARCHAR(255) NULL,
  motivo VARCHAR(80) NOT NULL,
  lote_sha256 CHAR(64) CHARACTER SET ascii NOT NULL,
  detectado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_cuarentena_informe FOREIGN KEY (informe_id) REFERENCES informe_financiero(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
CREATE TABLE IF NOT EXISTS identidad_reasignacion_auditoria (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  lote_sha256 CHAR(64) CHARACTER SET ascii NOT NULL,
  entidad ENUM('instrumento','informe') NOT NULL,
  entidad_id INT NOT NULL,
  empresa_anterior INT NOT NULL,
  empresa_nueva INT NOT NULL,
  edinet_code CHAR(6) NOT NULL,
  criterio VARCHAR(80) NOT NULL,
  aplicado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  revertido_en TIMESTAMP NULL,
  KEY ix_reasignacion (lote_sha256, entidad, entidad_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
