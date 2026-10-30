-- Sólo tablas nuevas de investigación; no cambia valuation_execution ni datos financieros originales.
-- LONGTEXT + JSON_VALID conserva la representación numérica exacta de Node.
ALTER TABLE capital_analysis MODIFY payload_json LONGTEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL;
ALTER TABLE capital_analysis ADD CONSTRAINT ck_cap_analysis_json_exact CHECK(JSON_VALID(payload_json));
ALTER TABLE capital_analysis ADD COLUMN payload_encoding_version tinyint unsigned NOT NULL DEFAULT 1;
ALTER TABLE capital_methodology MODIFY calibration_json LONGTEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL;
ALTER TABLE capital_methodology ADD CONSTRAINT ck_cap_method_json_exact CHECK(JSON_VALID(calibration_json));
