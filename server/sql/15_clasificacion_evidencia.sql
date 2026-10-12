-- Additive overlay. Original empresa.sector_id is never changed.
CREATE TABLE IF NOT EXISTS classification_evidence (
 id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
 empresa_id INT NOT NULL,
 sector_id INT NULL,
 source VARCHAR(200) NOT NULL,
 reference_date DATE NOT NULL,
 source_identifier VARCHAR(100) NOT NULL,
 criterion VARCHAR(200) NOT NULL,
 confidence ENUM('HIGH','MEDIUM','LOW') NOT NULL,
 status ENUM('ACCEPTED','PENDING','REJECTED') NOT NULL,
 evidence_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 evidence_json LONGTEXT NOT NULL CHECK(JSON_VALID(evidence_json)),
 created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE KEY uq_classification_evidence(evidence_hash),
 KEY idx_classification_company_date(empresa_id,reference_date,id),
 FOREIGN KEY (empresa_id) REFERENCES empresa(id),
 FOREIGN KEY (sector_id) REFERENCES sector(id)
) ENGINE=InnoDB;
