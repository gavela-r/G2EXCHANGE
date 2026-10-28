-- Additive provenance ledger. Do not delete original financial rows.
CREATE TABLE IF NOT EXISTS pcv_import_evidence (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 informe_id INT NOT NULL,
 record_type ENUM('PCV','KPI') NOT NULL,
 record_id BIGINT UNSIGNED NOT NULL,
 provider VARCHAR(40) NOT NULL,
 source_identifier VARCHAR(255) NOT NULL,
 concept_code VARCHAR(100) NOT NULL,
 evidence_json LONGTEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT fk_pcv_import_report FOREIGN KEY(informe_id) REFERENCES informe_financiero(id),
 CONSTRAINT ck_pcv_import_json CHECK(JSON_VALID(evidence_json)),
 KEY ix_pcv_import_record(record_type,record_id,provider,source_identifier),
 KEY ix_pcv_import_report(informe_id)
) ENGINE=InnoDB;
