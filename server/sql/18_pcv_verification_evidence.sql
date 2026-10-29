CREATE TABLE IF NOT EXISTS pcv_verification_evidence (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 informe_id INT NOT NULL,
 concept_code VARCHAR(80) NOT NULL,
 provider VARCHAR(30) NOT NULL,
 outcome VARCHAR(40) NOT NULL,
 evidence_hash CHAR(64) CHARACTER SET ascii NOT NULL,
 evidence_json LONGTEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE KEY uq_pcv_verification(informe_id,concept_code,provider,evidence_hash),
 KEY ix_pcv_verification_outcome(informe_id,outcome),
 CONSTRAINT fk_pcv_verification_report FOREIGN KEY(informe_id) REFERENCES informe_financiero(id),
 CONSTRAINT ck_pcv_verification_json CHECK(JSON_VALID(evidence_json))
) ENGINE=InnoDB;
