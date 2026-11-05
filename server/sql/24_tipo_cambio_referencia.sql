-- Tipos de cambio de referencia (unidades de moneda local por 1 USD).
-- Fuente: Reserva Federal H.10 (FRED DEXTAUS, DEXJPUS). Uso: solo para clasificar el tamaño
-- (perfil de rating de Damodaran, umbral 5.000 M USD). No convierte estados financieros.
CREATE TABLE IF NOT EXISTS tipo_cambio_referencia (
  id INT NOT NULL AUTO_INCREMENT,
  moneda CHAR(3) NOT NULL,
  fecha DATE NOT NULL,
  unidades_por_usd DECIMAL(18,6) NOT NULL,
  fuente VARCHAR(100) NOT NULL,
  serie VARCHAR(30) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_tc_moneda_fecha (moneda, fecha)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
