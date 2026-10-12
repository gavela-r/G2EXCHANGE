-- Schema only: no production data. MySQL 8. Restore into an EMPTY database.

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!50503 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `ajustes_noticias` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `valuation_run_id` int NOT NULL,
  `empresa_id` int NOT NULL,
  `noticia_id` bigint unsigned NOT NULL,
  `variable_code` varchar(100) NOT NULL,
  `ajuste_propuesto` decimal(14,10) NOT NULL,
  `ajuste_efectivo` decimal(14,10) DEFAULT NULL,
  `confianza_modelo` decimal(5,2) NOT NULL DEFAULT '0.00',
  `procesado` tinyint(1) NOT NULL DEFAULT '0',
  `estado` enum('PENDIENTE','APROBADO','DESCARTADO') NOT NULL DEFAULT 'PENDIENTE',
  `validado_por_usuario_id` int DEFAULT NULL,
  `fecha_validacion` datetime DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_ajustes_noticia_variable` (`noticia_id`,`variable_code`),
  KEY `fk_ajustes_noticias_usuario` (`validado_por_usuario_id`),
  KEY `idx_ajustes_empresa_estado` (`empresa_id`,`estado`),
  KEY `idx_ajustes_valuation_run` (`valuation_run_id`),
  CONSTRAINT `fk_ajustes_noticias_empresa` FOREIGN KEY (`empresa_id`) REFERENCES `empresa` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_ajustes_noticias_noticia` FOREIGN KEY (`noticia_id`) REFERENCES `noticia_empresa` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_ajustes_noticias_usuario` FOREIGN KEY (`validado_por_usuario_id`) REFERENCES `usuario` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_ajustes_run` FOREIGN KEY (`valuation_run_id`) REFERENCES `valuation_run` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `classification_evidence` (
  `id` int NOT NULL AUTO_INCREMENT,
  `empresa_id` int NOT NULL,
  `sector_id` int DEFAULT NULL,
  `source` varchar(200) NOT NULL,
  `reference_date` date NOT NULL,
  `source_identifier` varchar(100) NOT NULL,
  `criterion` varchar(200) NOT NULL,
  `confidence` enum('HIGH','MEDIUM','LOW') NOT NULL,
  `status` enum('ACCEPTED','PENDING','REJECTED') NOT NULL,
  `evidence_hash` char(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `evidence_json` longtext NOT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_classification_evidence` (`evidence_hash`),
  KEY `idx_classification_company_date` (`empresa_id`,`reference_date`,`id`),
  KEY `sector_id` (`sector_id`),
  CONSTRAINT `classification_evidence_ibfk_1` FOREIGN KEY (`empresa_id`) REFERENCES `empresa` (`id`),
  CONSTRAINT `classification_evidence_ibfk_2` FOREIGN KEY (`sector_id`) REFERENCES `sector` (`id`),
  CONSTRAINT `classification_evidence_chk_1` CHECK (json_valid(`evidence_json`))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `coste_capital_referencia` (
  `id` int NOT NULL AUTO_INCREMENT,
  `sector_id` int DEFAULT NULL,
  `pais_id` int DEFAULT NULL,
  `ke_referencia` decimal(10,4) DEFAULT NULL,
  `fecha_calculo` date DEFAULT NULL,
  `equity_risk_premium` decimal(10,6) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_sector_pais` (`sector_id`,`pais_id`),
  KEY `pais_id` (`pais_id`),
  CONSTRAINT `coste_capital_referencia_ibfk_1` FOREIGN KEY (`pais_id`) REFERENCES `pais` (`id`),
  CONSTRAINT `coste_capital_referencia_ibfk_2` FOREIGN KEY (`sector_id`) REFERENCES `sector` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `cotizacion_diaria` (
  `id` int NOT NULL AUTO_INCREMENT,
  `instrumento_id` int DEFAULT NULL,
  `fecha` date DEFAULT NULL,
  `precio_cierre` decimal(10,4) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `intrumento_id` (`instrumento_id`),
  CONSTRAINT `cotizacion_diaria_ibfk_1` FOREIGN KEY (`instrumento_id`) REFERENCES `instrumento` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `empresa` (
  `id` int NOT NULL AUTO_INCREMENT,
  `nombre_empresa` varchar(100) DEFAULT NULL,
  `pais_id` int DEFAULT NULL,
  `sector_id` int DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_empresa_nombre_pais` (`nombre_empresa`,`pais_id`),
  KEY `pais_id` (`pais_id`),
  KEY `sector_id` (`sector_id`),
  CONSTRAINT `empresa_ibfk_1` FOREIGN KEY (`pais_id`) REFERENCES `pais` (`id`),
  CONSTRAINT `empresa_ibfk_2` FOREIGN KEY (`sector_id`) REFERENCES `sector` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `evento_corporativo` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `instrumento_id` bigint unsigned NOT NULL,
  `tipo_evento` varchar(50) NOT NULL,
  `fecha` date NOT NULL,
  `valor_o_ratio` decimal(30,10) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_evento_corporativo` (`instrumento_id`,`tipo_evento`,`fecha`,`valor_o_ratio`),
  KEY `idx_evento_instrumento` (`instrumento_id`),
  KEY `idx_evento_fecha` (`fecha`),
  KEY `idx_evento_tipo` (`tipo_evento`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `informe_financiero` (
  `id` int NOT NULL AUTO_INCREMENT,
  `empresa_id` int DEFAULT NULL,
  `tipo_periodo` varchar(100) DEFAULT NULL,
  `tipo_documento` varchar(30) DEFAULT NULL,
  `fecha_fin_periodo` date DEFAULT NULL,
  `fecha_publicacion` date DEFAULT NULL,
  `fuente` varchar(30) NOT NULL DEFAULT 'SEC_EDGAR',
  `identificador_fuente` varchar(50) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unq_informe_fuente_identificador` (`fuente`,`identificador_fuente`),
  KEY `empresa_id` (`empresa_id`),
  CONSTRAINT `informe_financiero_ibfk_1` FOREIGN KEY (`empresa_id`) REFERENCES `empresa` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `instrumento` (
  `id` int NOT NULL AUTO_INCREMENT,
  `empresa_id` int DEFAULT NULL,
  `mercado_id` int DEFAULT NULL,
  `ticker` varchar(100) DEFAULT NULL,
  `isin` varchar(100) DEFAULT NULL,
  `moneda` varchar(100) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `ticker` (`ticker`),
  KEY `empresa_id` (`empresa_id`),
  KEY `mercado_id` (`mercado_id`),
  CONSTRAINT `instrumento_ibfk_1` FOREIGN KEY (`empresa_id`) REFERENCES `empresa` (`id`),
  CONSTRAINT `instrumento_ibfk_2` FOREIGN KEY (`mercado_id`) REFERENCES `mercado` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `kpi_financiero_informe` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `informe_id` int NOT NULL,
  `kpi` varchar(65) DEFAULT NULL,
  `unidad` enum('MONEDA','PORCENTAJE','VECES','NUMERO') DEFAULT NULL,
  `valor` decimal(30,10) DEFAULT NULL,
  `nivel_confianza` enum('alta','media','baja') DEFAULT NULL,
  `fecha_calculo` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_kpi_informe_kpi` (`informe_id`,`kpi`),
  CONSTRAINT `fk_kpi_informe` FOREIGN KEY (`informe_id`) REFERENCES `informe_financiero` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `lista_seguimiento` (
  `id` int NOT NULL AUTO_INCREMENT,
  `empresa_id` int DEFAULT NULL,
  `notas` varchar(100) DEFAULT NULL,
  `usuario_id` int NOT NULL,
  PRIMARY KEY (`id`),
  KEY `empresa_id` (`empresa_id`),
  CONSTRAINT `fk_lista_seguimiento_usuario` FOREIGN KEY (`id`) REFERENCES `usuario` (`id`),
  CONSTRAINT `lista_seguimiento_ibfk_1` FOREIGN KEY (`empresa_id`) REFERENCES `empresa` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `mercado` (
  `id` int NOT NULL AUTO_INCREMENT,
  `nombre_bolsa` varchar(100) DEFAULT NULL,
  `region` varchar(100) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `nombre_bolsa` (`nombre_bolsa`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `model_version` (
  `id` int NOT NULL AUTO_INCREMENT,
  `version` varchar(100) DEFAULT NULL,
  `fecha_publicacion` date DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `noticia_empresa` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `empresa_id` int NOT NULL,
  `fecha` date NOT NULL,
  `fuente` varchar(50) NOT NULL,
  `titular` varchar(500) NOT NULL,
  `resumen_ia` text,
  `tipo_evento` varchar(50) NOT NULL,
  `id_fuente` varchar(255) DEFAULT NULL,
  `url` varchar(1000) DEFAULT NULL,
  `relevancia` decimal(6,5) NOT NULL DEFAULT '1.00000',
  `direccion` tinyint NOT NULL DEFAULT '0',
  `intensidad` decimal(6,5) NOT NULL DEFAULT '0.50000',
  `confianza_fuente` decimal(6,5) NOT NULL DEFAULT '0.50000',
  `novedad` decimal(6,5) NOT NULL DEFAULT '1.00000',
  `decaimiento` decimal(6,5) NOT NULL DEFAULT '1.00000',
  `score_noticia` decimal(12,10) NOT NULL DEFAULT '0.0000000000',
  `hash_dedupe` char(64) DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_noticia_hash` (`hash_dedupe`),
  KEY `idx_noticia_empresa_fecha` (`empresa_id`,`fecha`),
  CONSTRAINT `fk_noticia_empresa_empresa` FOREIGN KEY (`empresa_id`) REFERENCES `empresa` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `pais` (
  `id` int NOT NULL AUTO_INCREMENT,
  `nombre_pais` varchar(100) NOT NULL,
  `interes_bono_10_ano` decimal(10,4) DEFAULT NULL,
  `riesgo_extra_por_pais` decimal(10,4) DEFAULT NULL,
  `codigo_iso` varchar(10) DEFAULT NULL,
  `tipo_interes_banco_central` decimal(10,4) DEFAULT NULL,
  `tasa_impositiva` decimal(10,4) DEFAULT NULL,
  `fecha_publicacion_bono10` date DEFAULT NULL,
  `fecha_publicacion_banco_central` date DEFAULT NULL,
  `equity_risk_premium` decimal(10,6) DEFAULT NULL,
  `prima_riesgo_mercado` decimal(10,6) DEFAULT NULL,
  `fecha_actualizacion_prima_mercado` date DEFAULT NULL,
  `fuente_prima_mercado` varchar(150) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `nombre_pais` (`nombre_pais`),
  UNIQUE KEY `codigo_iso` (`codigo_iso`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `partida_contable_valor` (
  `id` int NOT NULL AUTO_INCREMENT,
  `informe_id` int DEFAULT NULL,
  `concepto` varchar(2000) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci DEFAULT NULL,
  `concepto_estandar_id` bigint unsigned DEFAULT NULL,
  `importe` decimal(24,4) DEFAULT NULL,
  `nivel_confianza` varchar(100) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `informe_id` (`informe_id`),
  KEY `fk_partida_taxonomia` (`concepto_estandar_id`),
  CONSTRAINT `fk_partida_taxonomia` FOREIGN KEY (`concepto_estandar_id`) REFERENCES `taxonomia_concepto` (`id`),
  CONSTRAINT `partida_contable_valor_ibfk_1` FOREIGN KEY (`informe_id`) REFERENCES `informe_financiero` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `rating_sintetico` (
  `id` int NOT NULL AUTO_INCREMENT,
  `perfil_empresa` enum('GRANDE_NO_FINANCIERA','PEQUEÑA_RIESGOSA','FINANCIERA') DEFAULT NULL,
  `conbertura_interes_min_exclusiva` decimal(10,4) DEFAULT NULL,
  `cobertura_interes_max_inclusiva` decimal(10,4) DEFAULT NULL,
  `rating_estimado` varchar(100) DEFAULT NULL,
  `bucket_mercado` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci DEFAULT NULL,
  `serie_fred` varchar(100) DEFAULT NULL,
  `spread_damodaran` decimal(10,4) DEFAULT NULL,
  `spread_credito_base` decimal(10,4) DEFAULT NULL,
  `spread_credito_optimista` decimal(10,4) DEFAULT NULL,
  `spread_credito_pesimista` decimal(10,4) DEFAULT NULL,
  `orden_riesgo` smallint DEFAULT NULL,
  `fuente_intervalos` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci DEFAULT NULL,
  `fuente_spread_mercado` varchar(100) DEFAULT NULL,
  `fecha_datos_mercado` date DEFAULT NULL,
  `fecha_actualizacion` timestamp NULL DEFAULT NULL,
  `activo` tinyint(1) DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `sector` (
  `id` int NOT NULL AUTO_INCREMENT,
  `nombre_sector` varchar(100) DEFAULT NULL,
  `sensibilidad_al_mercado` decimal(10,4) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `nombre_sector` (`nombre_sector`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `taxonomia_concepto` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `concepto_estandar` varchar(150) NOT NULL,
  `categoria` varchar(100) NOT NULL,
  `alias_sec` varchar(255) DEFAULT NULL,
  `alias_edinet` varchar(255) DEFAULT NULL,
  `alias_finmind` varchar(255) DEFAULT NULL,
  `descripcion` varchar(500) DEFAULT NULL,
  `unidad_tipo` varchar(30) DEFAULT NULL,
  `activo` tinyint(1) NOT NULL DEFAULT '1',
  `signo_esperado` enum('POSITIVO','NEGATIVO','VARIABLE') DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_concepto_estandar` (`concepto_estandar`),
  UNIQUE KEY `concepto_estandar` (`concepto_estandar`),
  KEY `idx_categoria` (`categoria`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `usuario` (
  `id` int NOT NULL AUTO_INCREMENT,
  `nombre` varchar(100) NOT NULL,
  `telefono` int DEFAULT NULL,
  `DNI` varchar(100) DEFAULT NULL,
  `contrasena` varchar(100) DEFAULT NULL,
  `repetirContrasena` varchar(100) DEFAULT NULL,
  `fecha_alta` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `valuation_execution` (
  `valuation_run_id` int NOT NULL,
  `input_hash` char(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `instrumento_id` int NOT NULL,
  `input_json` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  `trace_json` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  `output_json` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  `financial_state` varchar(40) NOT NULL,
  `engine_version` varchar(20) NOT NULL,
  `manifest_hash` char(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`valuation_run_id`),
  UNIQUE KEY `uq_execution_input` (`input_hash`),
  KEY `idx_execution_instrumento` (`instrumento_id`),
  CONSTRAINT `fk_execution_instrumento` FOREIGN KEY (`instrumento_id`) REFERENCES `instrumento` (`id`),
  CONSTRAINT `fk_execution_run` FOREIGN KEY (`valuation_run_id`) REFERENCES `valuation_run` (`id`),
  CONSTRAINT `valuation_execution_chk_1` CHECK (json_valid(`input_json`)),
  CONSTRAINT `valuation_execution_chk_2` CHECK (json_valid(`trace_json`)),
  CONSTRAINT `valuation_execution_chk_3` CHECK (json_valid(`output_json`))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `valuation_input_snapshot` (
  `id` int NOT NULL AUTO_INCREMENT,
  `empresa_id` int NOT NULL,
  `fecha_valoracion` date NOT NULL,
  `precio_usado` decimal(18,4) NOT NULL,
  `fecha_precio` date NOT NULL,
  `coste_capital_id` int NOT NULL,
  `rating_sintetico_id` int DEFAULT NULL,
  `interest_coverage` decimal(10,4) DEFAULT NULL,
  `synthetic_rating` varchar(10) DEFAULT NULL,
  `credit_spread` decimal(8,5) DEFAULT NULL,
  `reporting_currency` varchar(3) NOT NULL DEFAULT 'USD',
  `valuation_currency` varchar(3) NOT NULL DEFAULT 'USD',
  `fx_rate_used` decimal(12,6) NOT NULL DEFAULT '1.000000',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `fk_snapshot_coste_capital` (`coste_capital_id`),
  KEY `fk_snapshot_rating` (`rating_sintetico_id`),
  KEY `idx_snapshot_empresa_fecha` (`empresa_id`,`fecha_valoracion`),
  CONSTRAINT `fk_snapshot_coste_capital` FOREIGN KEY (`coste_capital_id`) REFERENCES `coste_capital_referencia` (`id`),
  CONSTRAINT `fk_snapshot_empresa` FOREIGN KEY (`empresa_id`) REFERENCES `empresa` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_snapshot_rating` FOREIGN KEY (`rating_sintetico_id`) REFERENCES `rating_sintetico` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `valuation_input_snapshot_detalle` (
  `id` int NOT NULL AUTO_INCREMENT,
  `snapshot_id` int NOT NULL,
  `valuation_input_version_id` int NOT NULL,
  `orden_ejercicio` int NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_visd_snapshot_viv` (`snapshot_id`,`valuation_input_version_id`),
  KEY `fk_visd_viv` (`valuation_input_version_id`),
  CONSTRAINT `fk_visd_snapshot` FOREIGN KEY (`snapshot_id`) REFERENCES `valuation_input_snapshot` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_visd_viv` FOREIGN KEY (`valuation_input_version_id`) REFERENCES `valuation_input_version` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `valuation_input_version` (
  `id` int NOT NULL AUTO_INCREMENT,
  `empresa_id` int NOT NULL,
  `informe_id` int NOT NULL,
  `tipo_periodo` varchar(30) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `fuente_informe` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `fecha_fin_periodo` date NOT NULL,
  `moneda` varchar(10) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `ingresos` decimal(30,10) DEFAULT NULL,
  `ebitda` decimal(30,10) DEFAULT NULL,
  `depreciacion_amortizacion` decimal(30,10) DEFAULT NULL,
  `ebit` decimal(30,10) DEFAULT NULL,
  `gasto_intereses` decimal(30,10) DEFAULT NULL,
  `beneficio_antes_impuestos` decimal(30,10) DEFAULT NULL,
  `impuesto_beneficios` decimal(30,10) DEFAULT NULL,
  `beneficio_neto` decimal(30,10) DEFAULT NULL,
  `efectivo` decimal(30,10) DEFAULT NULL,
  `deuda_corto_plazo` decimal(30,10) DEFAULT NULL,
  `deuda_largo_plazo` decimal(30,10) DEFAULT NULL,
  `deuda_total` decimal(30,10) DEFAULT NULL,
  `deuda_neta` decimal(30,10) DEFAULT NULL,
  `cuentas_cobrar` decimal(30,10) DEFAULT NULL,
  `inventarios` decimal(30,10) DEFAULT NULL,
  `cuentas_pagar` decimal(30,10) DEFAULT NULL,
  `patrimonio_neto` decimal(30,10) DEFAULT NULL,
  `activos_totales` decimal(30,10) DEFAULT NULL,
  `pasivos_totales` decimal(30,10) DEFAULT NULL,
  `capital_circulante_operativo` decimal(30,10) DEFAULT NULL,
  `flujo_caja_operativo` decimal(30,10) DEFAULT NULL,
  `capex` decimal(30,10) DEFAULT NULL,
  `fcf` decimal(30,10) DEFAULT NULL,
  `dividendos_pagados` decimal(30,10) DEFAULT NULL,
  `acciones_en_circulacion` decimal(30,10) DEFAULT NULL,
  `margen_ebit` decimal(20,10) DEFAULT NULL,
  `margen_ebitda` decimal(20,10) DEFAULT NULL,
  `margen_neto` decimal(20,10) DEFAULT NULL,
  `margen_fcf` decimal(20,10) DEFAULT NULL,
  `roa` decimal(20,10) DEFAULT NULL,
  `roe` decimal(20,10) DEFAULT NULL,
  `cobertura_intereses` decimal(30,10) DEFAULT NULL,
  `nivel_confianza` enum('ALTA','MEDIA','BAJA') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `hash_inputs` char(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_valuation_input_version` (`empresa_id`,`informe_id`,`hash_inputs`),
  KEY `idx_viv_empresa_fecha` (`empresa_id`,`fecha_fin_periodo`),
  KEY `idx_viv_informe` (`informe_id`),
  KEY `idx_viv_tipo_periodo` (`tipo_periodo`),
  KEY `idx_viv_fecha` (`fecha_fin_periodo`),
  KEY `idx_viv_hash` (`hash_inputs`),
  CONSTRAINT `fk_valuation_input_empresa` FOREIGN KEY (`empresa_id`) REFERENCES `empresa` (`id`),
  CONSTRAINT `fk_valuation_input_informe` FOREIGN KEY (`informe_id`) REFERENCES `informe_financiero` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `valuation_run` (
  `id` int NOT NULL AUTO_INCREMENT,
  `empresa_id` int NOT NULL,
  `input_snapshot_id` int NOT NULL,
  `model_version_id` int NOT NULL,
  `template_code` varchar(2) NOT NULL,
  `valuation_method_family` varchar(20) NOT NULL,
  `estado` enum('PREPARANDO','EJECUTANDO','COMPLETADO','ERROR') NOT NULL DEFAULT 'PREPARANDO',
  `engine_version` varchar(20) DEFAULT NULL,
  `error_mensaje` varchar(500) DEFAULT NULL,
  `fecha_inicio` datetime DEFAULT NULL,
  `fecha_fin` datetime DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `fk_run_empresa` (`empresa_id`),
  KEY `fk_run_snapshot` (`input_snapshot_id`),
  KEY `fk_run_model_version` (`model_version_id`),
  CONSTRAINT `fk_run_empresa` FOREIGN KEY (`empresa_id`) REFERENCES `empresa` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_run_model_version` FOREIGN KEY (`model_version_id`) REFERENCES `model_version` (`id`),
  CONSTRAINT `fk_run_snapshot` FOREIGN KEY (`input_snapshot_id`) REFERENCES `valuation_input_snapshot` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `valuation_run_parametros` (
  `id` int NOT NULL AUTO_INCREMENT,
  `valuation_run_id` int NOT NULL,
  `escenario` enum('CONSERVATIVE','BASE','OPTIMISTIC') NOT NULL,
  `ke` decimal(10,6) DEFAULT NULL,
  `rf` decimal(10,6) DEFAULT NULL,
  `beta` decimal(10,6) DEFAULT NULL,
  `equity_risk_premium` decimal(10,6) DEFAULT NULL,
  `spread_credito` decimal(10,6) DEFAULT NULL,
  `kd` decimal(10,6) DEFAULT NULL,
  `peso_patrimonio` decimal(10,6) DEFAULT NULL,
  `peso_deuda` decimal(10,6) DEFAULT NULL,
  `tasa_impositiva` decimal(10,6) DEFAULT NULL,
  `wacc_base` decimal(10,6) DEFAULT NULL,
  `prima_iliquidez` decimal(10,6) NOT NULL DEFAULT '0.000000',
  `prima_concentracion_clientes` decimal(10,6) NOT NULL DEFAULT '0.000000',
  `wacc_ajustado` decimal(10,6) DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_run_escenario` (`valuation_run_id`,`escenario`),
  CONSTRAINT `fk_parametros_valuation_run` FOREIGN KEY (`valuation_run_id`) REFERENCES `valuation_run` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `valuation_run_resultado` (
  `id` int NOT NULL AUTO_INCREMENT,
  `valuation_run_id` int NOT NULL,
  `escenario` enum('CONSERVATIVE','BASE','OPTIMISTIC') NOT NULL,
  `fair_value` decimal(18,4) NOT NULL,
  `max_buy_price` decimal(18,4) NOT NULL,
  `current_price` decimal(18,4) NOT NULL,
  `upside` decimal(8,4) NOT NULL,
  `wacc` decimal(8,5) NOT NULL,
  `terminal_growth` decimal(8,5) NOT NULL,
  `decision` enum('BUY','WATCH','WAIT','DATA_PENDING') NOT NULL,
  `confidence` enum('HIGH','MEDIUM','LOW') NOT NULL,
  `validation_status` enum('APPROVED','REVIEW','BLOCKED') NOT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_resultado_run_escenario` (`valuation_run_id`,`escenario`),
  KEY `idx_resultado_run` (`valuation_run_id`),
  CONSTRAINT `fk_resultado_run` FOREIGN KEY (`valuation_run_id`) REFERENCES `valuation_run` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

