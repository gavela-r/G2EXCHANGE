-- Registro explícito de la nueva versión. Nunca reasigna valuation_run históricos.
INSERT INTO model_version(version,fecha_publicacion)
 SELECT '2.0.0-capital',CURRENT_DATE
 WHERE NOT EXISTS(SELECT 1 FROM model_version WHERE version='2.0.0-capital');
ALTER TABLE capital_analysis ADD COLUMN model_version_id int NULL;
ALTER TABLE capital_analysis ADD CONSTRAINT fk_cap_analysis_model FOREIGN KEY(model_version_id) REFERENCES model_version(id);
