CREATE TABLE IF NOT EXISTS financial_report_evidence (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 informe_id INT NOT NULL,
 empresa_id INT NOT NULL,
 provider VARCHAR(30) NOT NULL,
 source_identifier VARCHAR(50) NOT NULL,
 registry_identifier VARCHAR(50) NOT NULL,
 evidence_json LONGTEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE KEY uq_report_evidence(informe_id),
 CONSTRAINT fk_report_evidence_informe FOREIGN KEY(informe_id) REFERENCES informe_financiero(id),
 CONSTRAINT fk_report_evidence_empresa FOREIGN KEY(empresa_id) REFERENCES empresa(id),
 CONSTRAINT ck_report_evidence_json CHECK(JSON_VALID(evidence_json))
) ENGINE=InnoDB;
