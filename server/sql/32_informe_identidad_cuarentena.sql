-- 32_informe_identidad_cuarentena.sql — PREPARADA, NO EJECUTADA.
-- Informes cuya fuente no corresponde al país de la empresa (identidad cruzada por colisión de código bursátil).
-- No se borra ni modifica ningún informe ni PCV: la cuarentena sólo los excluye de selección y certificación.
CREATE TABLE IF NOT EXISTS informe_identidad_cuarentena (
  informe_id INT NOT NULL PRIMARY KEY,
  empresa_id INT NOT NULL,
  pais_empresa CHAR(2) NOT NULL,
  fuente_informe VARCHAR(40) NOT NULL,
  identificador_fuente VARCHAR(255) NULL,
  motivo VARCHAR(80) NOT NULL,
  detectado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_cuarentena_informe FOREIGN KEY (informe_id) REFERENCES informe_financiero(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
