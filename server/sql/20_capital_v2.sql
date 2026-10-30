-- Aditiva. No modifica cotizacion_diaria ni ejecuciones/snapshots históricos.
CREATE TABLE IF NOT EXISTS capital_schema_version (
 version varchar(30) PRIMARY KEY, migration_hash char(64) NOT NULL, applied_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS capital_identity_evidence (
 id bigint unsigned AUTO_INCREMENT PRIMARY KEY, instrumento_id int NOT NULL,
 provider varchar(40) NOT NULL, provider_id varchar(150) NOT NULL, market_id int NOT NULL,
 share_class varchar(80) NULL, status enum('VERIFIED','PARTIAL','BLOCKED') NOT NULL,
 reference_date date NOT NULL, evidence_json json NOT NULL, evidence_hash char(64) NOT NULL,
 created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE KEY uq_cap_identity(evidence_hash), KEY ix_cap_identity(instrumento_id,reference_date,id),
 FOREIGN KEY(instrumento_id) REFERENCES instrumento(id), FOREIGN KEY(market_id) REFERENCES mercado(id)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS capital_daily_observation (
 id bigint unsigned AUTO_INCREMENT PRIMARY KEY, instrumento_id int NOT NULL, session_date date NOT NULL,
 market_id int NOT NULL, currency char(3) NOT NULL, open_price decimal(24,8) NULL,
 high_price decimal(24,8) NULL, low_price decimal(24,8) NULL, close_price decimal(24,8) NOT NULL,
 adjusted_close decimal(24,8) NULL, share_volume decimal(30,4) NULL, traded_value decimal(30,4) NULL,
 value_kind enum('OBSERVED','ESTIMATED','UNKNOWN') NOT NULL,
 source varchar(50) NOT NULL, feed varchar(50) NOT NULL, fetched_at datetime(3) NOT NULL,
 adjustment_type varchar(50) NOT NULL, validation_status enum('VALID','UNRECONCILED','REJECTED') NOT NULL,
 revision int unsigned NOT NULL, observation_hash char(64) NOT NULL, evidence_json json NOT NULL,
 UNIQUE KEY uq_cap_observation(observation_hash),
 UNIQUE KEY uq_cap_revision(instrumento_id,session_date,source,feed,revision),
 KEY ix_cap_series(instrumento_id,session_date,validation_status,id),
 FOREIGN KEY(instrumento_id) REFERENCES instrumento(id), FOREIGN KEY(market_id) REFERENCES mercado(id),
 CHECK(close_price>0), CHECK(share_volume IS NULL OR share_volume>=0), CHECK(traded_value IS NULL OR traded_value>=0)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS capital_financial_evidence (
 id bigint unsigned AUTO_INCREMENT PRIMARY KEY, informe_id int NOT NULL, original_version_id int NULL,
 civil_period_end date NOT NULL, publication_date date NULL, retrieved_at datetime(3) NOT NULL,
 source varchar(100) NOT NULL, evidence_json json NOT NULL, evidence_hash char(64) NOT NULL,
 UNIQUE KEY uq_cap_financial_evidence(evidence_hash), KEY ix_cap_financial(informe_id,id),
 FOREIGN KEY(informe_id) REFERENCES informe_financiero(id), FOREIGN KEY(original_version_id) REFERENCES valuation_input_version(id)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS capital_methodology (
 id varchar(100) PRIMARY KEY, version varchar(30) NOT NULL,
 status enum('EXPERIMENTAL','VALIDATED','APPROVED','REJECTED') NOT NULL,
 factor enum('LIQUIDEZ_BURSATIL','TAMANO_RESIDUAL') NOT NULL, calibration_json json NOT NULL,
 evidence_hash char(64) NOT NULL, created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE KEY uq_cap_method_evidence(evidence_hash)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS capital_analysis (
 id bigint unsigned AUTO_INCREMENT PRIMARY KEY, empresa_id int NOT NULL, instrumento_id int NULL,
 as_of date NOT NULL, engine_version varchar(30) NOT NULL, kind enum('DIAGNOSTIC','BENCHMARK','SIMULATION','PROPOSAL') NOT NULL,
 parent_run_id int NULL, payload_json json NOT NULL, content_hash char(64) NOT NULL,
 created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE KEY uq_cap_analysis(content_hash), KEY ix_cap_analysis(empresa_id,as_of,id),
 FOREIGN KEY(empresa_id) REFERENCES empresa(id), FOREIGN KEY(instrumento_id) REFERENCES instrumento(id),
 FOREIGN KEY(parent_run_id) REFERENCES valuation_run(id)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS capital_decision (
 id bigint unsigned AUTO_INCREMENT PRIMARY KEY, analysis_id bigint unsigned NOT NULL,
 action enum('APPROVED','REJECTED') NOT NULL, actor varchar(150) NOT NULL, reason text NOT NULL,
 previous_decision_id bigint unsigned NULL, request_id char(36) NOT NULL,
 created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE KEY uq_cap_decision(request_id),
 FOREIGN KEY(analysis_id) REFERENCES capital_analysis(id), FOREIGN KEY(previous_decision_id) REFERENCES capital_decision(id)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS capital_download_checkpoint (
 instrumento_id int NOT NULL, source varchar(50) NOT NULL, feed varchar(50) NOT NULL,
 cursor_json json NOT NULL, updated_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 PRIMARY KEY(instrumento_id,source,feed), FOREIGN KEY(instrumento_id) REFERENCES instrumento(id)
) ENGINE=InnoDB;
