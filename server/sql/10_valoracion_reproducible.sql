-- PROPUESTA: no ejecutar en base real sin autorización. MySQL 8; DDL no transaccional.
CREATE TABLE IF NOT EXISTS valuation_execution (
 valuation_run_id INT NOT NULL PRIMARY KEY,
 input_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 instrumento_id INT NOT NULL,
 -- Texto canónico: el serializador JSON numérico de MySQL puede variar un ULP.
 -- JSON_VALID mantiene validación sintáctica sin modificar los bytes/decimales.
 input_json LONGTEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL CHECK (JSON_VALID(input_json)),
 trace_json LONGTEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL CHECK (JSON_VALID(trace_json)),
 output_json LONGTEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL CHECK (JSON_VALID(output_json)),
 financial_state VARCHAR(40) NOT NULL, engine_version VARCHAR(20) NOT NULL,
 manifest_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE KEY uq_execution_input (input_hash), KEY idx_execution_instrumento (instrumento_id),
 CONSTRAINT fk_execution_run FOREIGN KEY (valuation_run_id) REFERENCES valuation_run(id),
 CONSTRAINT fk_execution_instrumento FOREIGN KEY (instrumento_id) REFERENCES instrumento(id)
) ENGINE=InnoDB;
INSERT INTO model_version (version,fecha_publicacion)
SELECT '1.5.1',CURRENT_DATE WHERE NOT EXISTS (SELECT 1 FROM model_version WHERE version='1.5.1');
