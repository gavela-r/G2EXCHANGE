# Diccionario estructural extraído del DDL

Fuente: `server/sql/00_schema.sql`. No representa una consulta a la instancia desplegada. Nombres y tipos conservados, incluidas erratas históricas.

## classification_evidence

| Columna | Definición SQL |
|---|---|
| id | int NOT NULL AUTO_INCREMENT |
| empresa_id | int NOT NULL |
| sector_id | int DEFAULT NULL |
| source | varchar(200) NOT NULL |
| reference_date | date NOT NULL |
| source_identifier | varchar(100) NOT NULL |
| criterion | varchar(200) NOT NULL |
| confidence | enum('HIGH','MEDIUM','LOW') NOT NULL |
| status | enum('ACCEPTED','PENDING','REJECTED') NOT NULL |
| evidence_hash | char(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL |
| evidence_json | longtext NOT NULL |
| created_at | datetime NOT NULL DEFAULT CURRENT_TIMESTAMP |

Claves y relaciones:

```sql
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_classification_evidence` (`evidence_hash`),
  CONSTRAINT `classification_evidence_ibfk_1` FOREIGN KEY (`empresa_id`) REFERENCES `empresa` (`id`),
  CONSTRAINT `classification_evidence_ibfk_2` FOREIGN KEY (`sector_id`) REFERENCES `sector` (`id`),
  CONSTRAINT `classification_evidence_chk_1` CHECK (json_valid(`evidence_json`))
```

## coste_capital_referencia

| Columna | Definición SQL |
|---|---|
| id | int NOT NULL AUTO_INCREMENT |
| sector_id | int DEFAULT NULL |
| pais_id | int DEFAULT NULL |
| ke_referencia | decimal(10,4) DEFAULT NULL |
| fecha_calculo | date DEFAULT NULL |
| equity_risk_premium | decimal(10,6) DEFAULT NULL |

Claves y relaciones:

```sql
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_sector_pais` (`sector_id`,`pais_id`),
  CONSTRAINT `coste_capital_referencia_ibfk_1` FOREIGN KEY (`pais_id`) REFERENCES `pais` (`id`),
  CONSTRAINT `coste_capital_referencia_ibfk_2` FOREIGN KEY (`sector_id`) REFERENCES `sector` (`id`)
```

## cotizacion_diaria

| Columna | Definición SQL |
|---|---|
| id | int NOT NULL AUTO_INCREMENT |
| instrumento_id | int DEFAULT NULL |
| fecha | date DEFAULT NULL |
| precio_cierre | decimal(10,4) DEFAULT NULL |

Claves y relaciones:

```sql
  PRIMARY KEY (`id`),
  UNIQUE KEY `intrumento_id` (`instrumento_id`),
  CONSTRAINT `cotizacion_diaria_ibfk_1` FOREIGN KEY (`instrumento_id`) REFERENCES `instrumento` (`id`)
```

## empresa

| Columna | Definición SQL |
|---|---|
| id | int NOT NULL AUTO_INCREMENT |
| nombre_empresa | varchar(100) DEFAULT NULL |
| pais_id | int DEFAULT NULL |
| sector_id | int DEFAULT NULL |

Claves y relaciones:

```sql
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_empresa_nombre_pais` (`nombre_empresa`,`pais_id`),
  CONSTRAINT `empresa_ibfk_1` FOREIGN KEY (`pais_id`) REFERENCES `pais` (`id`),
  CONSTRAINT `empresa_ibfk_2` FOREIGN KEY (`sector_id`) REFERENCES `sector` (`id`)
```

## evento_corporativo

| Columna | Definición SQL |
|---|---|
| id | bigint unsigned NOT NULL AUTO_INCREMENT |
| instrumento_id | bigint unsigned NOT NULL |
| tipo_evento | varchar(50) NOT NULL |
| fecha | date NOT NULL |
| valor_o_ratio | decimal(30,10) DEFAULT NULL |

Claves y relaciones:

```sql
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_evento_corporativo` (`instrumento_id`,`tipo_evento`,`fecha`,`valor_o_ratio`),
```

## financial_report_evidence

| Columna | Definición SQL |
|---|---|
| id | bigint unsigned NOT NULL AUTO_INCREMENT |
| informe_id | int NOT NULL |
| empresa_id | int NOT NULL |
| provider | varchar(30) NOT NULL |
| source_identifier | varchar(50) NOT NULL |
| registry_identifier | varchar(50) NOT NULL |
| evidence_json | longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL |
| created_at | timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP |

Claves y relaciones:

```sql
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_report_evidence` (`informe_id`),
  CONSTRAINT `fk_report_evidence_empresa` FOREIGN KEY (`empresa_id`) REFERENCES `empresa` (`id`),
  CONSTRAINT `fk_report_evidence_informe` FOREIGN KEY (`informe_id`) REFERENCES `informe_financiero` (`id`),
  CONSTRAINT `ck_report_evidence_json` CHECK (json_valid(`evidence_json`))
```

## informe_financiero

| Columna | Definición SQL |
|---|---|
| id | int NOT NULL AUTO_INCREMENT |
| empresa_id | int DEFAULT NULL |
| tipo_periodo | varchar(100) DEFAULT NULL |
| tipo_documento | varchar(30) DEFAULT NULL |
| fecha_fin_periodo | date DEFAULT NULL |
| fecha_publicacion | date DEFAULT NULL |
| fuente | varchar(30) NOT NULL DEFAULT 'SEC_EDGAR' |
| identificador_fuente | varchar(50) DEFAULT NULL |

Claves y relaciones:

```sql
  PRIMARY KEY (`id`),
  UNIQUE KEY `unq_informe_fuente_identificador` (`fuente`,`identificador_fuente`),
  CONSTRAINT `informe_financiero_ibfk_1` FOREIGN KEY (`empresa_id`) REFERENCES `empresa` (`id`)
```

## instrumento

| Columna | Definición SQL |
|---|---|
| id | int NOT NULL AUTO_INCREMENT |
| empresa_id | int DEFAULT NULL |
| mercado_id | int DEFAULT NULL |
| ticker | varchar(100) DEFAULT NULL |
| isin | varchar(100) DEFAULT NULL |
| moneda | varchar(100) DEFAULT NULL |

Claves y relaciones:

```sql
  PRIMARY KEY (`id`),
  UNIQUE KEY `ticker` (`ticker`),
  CONSTRAINT `instrumento_ibfk_1` FOREIGN KEY (`empresa_id`) REFERENCES `empresa` (`id`),
  CONSTRAINT `instrumento_ibfk_2` FOREIGN KEY (`mercado_id`) REFERENCES `mercado` (`id`)
```

## kpi_financiero_informe

| Columna | Definición SQL |
|---|---|
| id | bigint unsigned NOT NULL AUTO_INCREMENT |
| informe_id | int NOT NULL |
| kpi | varchar(65) DEFAULT NULL |
| unidad | enum('MONEDA','PORCENTAJE','VECES','NUMERO') DEFAULT NULL |
| valor | decimal(30,10) DEFAULT NULL |
| nivel_confianza | enum('alta','media','baja') DEFAULT NULL |
| fecha_calculo | timestamp NULL DEFAULT NULL |
| created_at | timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP |

Claves y relaciones:

```sql
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_kpi_informe_kpi` (`informe_id`,`kpi`),
  CONSTRAINT `fk_kpi_informe` FOREIGN KEY (`informe_id`) REFERENCES `informe_financiero` (`id`)
```

## mercado

| Columna | Definición SQL |
|---|---|
| id | int NOT NULL AUTO_INCREMENT |
| nombre_bolsa | varchar(100) DEFAULT NULL |
| region | varchar(100) DEFAULT NULL |

Claves y relaciones:

```sql
  PRIMARY KEY (`id`),
  UNIQUE KEY `nombre_bolsa` (`nombre_bolsa`)
```

## model_version

| Columna | Definición SQL |
|---|---|
| id | int NOT NULL AUTO_INCREMENT |
| version | varchar(100) DEFAULT NULL |
| fecha_publicacion | date DEFAULT NULL |

Claves y relaciones:

```sql
  PRIMARY KEY (`id`)
```

## pais

| Columna | Definición SQL |
|---|---|
| id | int NOT NULL AUTO_INCREMENT |
| nombre_pais | varchar(100) NOT NULL |
| interes_bono_10_ano | decimal(10,4) DEFAULT NULL |
| riesgo_extra_por_pais | decimal(10,4) DEFAULT NULL |
| codigo_iso | varchar(10) DEFAULT NULL |
| tipo_interes_banco_central | decimal(10,4) DEFAULT NULL |
| tasa_impositiva | decimal(10,4) DEFAULT NULL |
| fecha_publicacion_bono10 | date DEFAULT NULL |
| fecha_publicacion_banco_central | date DEFAULT NULL |
| equity_risk_premium | decimal(10,6) DEFAULT NULL |
| prima_riesgo_mercado | decimal(10,6) DEFAULT NULL |
| fecha_actualizacion_prima_mercado | date DEFAULT NULL |
| fuente_prima_mercado | varchar(150) DEFAULT NULL |

Claves y relaciones:

```sql
  PRIMARY KEY (`id`),
  UNIQUE KEY `nombre_pais` (`nombre_pais`),
  UNIQUE KEY `codigo_iso` (`codigo_iso`)
```

## partida_contable_valor

| Columna | Definición SQL |
|---|---|
| id | int NOT NULL AUTO_INCREMENT |
| informe_id | int DEFAULT NULL |
| concepto | varchar(2000) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci DEFAULT NULL |
| concepto_estandar_id | bigint unsigned DEFAULT NULL |
| importe | decimal(24,4) DEFAULT NULL |
| nivel_confianza | varchar(100) DEFAULT NULL |

Claves y relaciones:

```sql
  PRIMARY KEY (`id`),
  CONSTRAINT `fk_partida_taxonomia` FOREIGN KEY (`concepto_estandar_id`) REFERENCES `taxonomia_concepto` (`id`),
  CONSTRAINT `partida_contable_valor_ibfk_1` FOREIGN KEY (`informe_id`) REFERENCES `informe_financiero` (`id`)
```

## pcv_import_evidence

| Columna | Definición SQL |
|---|---|
| id | bigint unsigned NOT NULL AUTO_INCREMENT |
| informe_id | int NOT NULL |
| record_type | enum('PCV','KPI') NOT NULL |
| record_id | bigint unsigned NOT NULL |
| provider | varchar(40) NOT NULL |
| source_identifier | varchar(255) NOT NULL |
| concept_code | varchar(100) NOT NULL |
| evidence_json | longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL |
| created_at | timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP |

Claves y relaciones:

```sql
  PRIMARY KEY (`id`),
  CONSTRAINT `fk_pcv_import_report` FOREIGN KEY (`informe_id`) REFERENCES `informe_financiero` (`id`),
  CONSTRAINT `ck_pcv_import_json` CHECK (json_valid(`evidence_json`))
```

## pcv_verification_evidence

| Columna | Definición SQL |
|---|---|
| id | bigint unsigned NOT NULL AUTO_INCREMENT |
| informe_id | int NOT NULL |
| concept_code | varchar(80) NOT NULL |
| provider | varchar(30) NOT NULL |
| outcome | varchar(40) NOT NULL |
| evidence_hash | char(64) CHARACTER SET ascii COLLATE ascii_general_ci NOT NULL |
| evidence_json | longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL |
| created_at | timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP |

Claves y relaciones:

```sql
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_pcv_verification` (`informe_id`,`concept_code`,`provider`,`evidence_hash`),
  CONSTRAINT `fk_pcv_verification_report` FOREIGN KEY (`informe_id`) REFERENCES `informe_financiero` (`id`),
  CONSTRAINT `ck_pcv_verification_json` CHECK (json_valid(`evidence_json`))
```

## rating_sintetico

| Columna | Definición SQL |
|---|---|
| id | int NOT NULL AUTO_INCREMENT |
| perfil_empresa | enum('GRANDE_NO_FINANCIERA','PEQUEÑA_RIESGOSA','FINANCIERA') DEFAULT NULL |
| conbertura_interes_min_exclusiva | decimal(10,4) DEFAULT NULL |
| cobertura_interes_max_inclusiva | decimal(10,4) DEFAULT NULL |
| rating_estimado | varchar(100) DEFAULT NULL |
| bucket_mercado | varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci DEFAULT NULL |
| serie_fred | varchar(100) DEFAULT NULL |
| spread_damodaran | decimal(10,4) DEFAULT NULL |
| spread_credito_base | decimal(10,4) DEFAULT NULL |
| spread_credito_optimista | decimal(10,4) DEFAULT NULL |
| spread_credito_pesimista | decimal(10,4) DEFAULT NULL |
| orden_riesgo | smallint DEFAULT NULL |
| fuente_intervalos | varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci DEFAULT NULL |
| fuente_spread_mercado | varchar(100) DEFAULT NULL |
| fecha_datos_mercado | date DEFAULT NULL |
| fecha_actualizacion | timestamp NULL DEFAULT NULL |
| activo | tinyint(1) DEFAULT NULL |

Claves y relaciones:

```sql
  PRIMARY KEY (`id`)
```

## sector

| Columna | Definición SQL |
|---|---|
| id | int NOT NULL AUTO_INCREMENT |
| nombre_sector | varchar(100) DEFAULT NULL |
| sensibilidad_al_mercado | decimal(10,4) DEFAULT NULL |

Claves y relaciones:

```sql
  PRIMARY KEY (`id`),
  UNIQUE KEY `nombre_sector` (`nombre_sector`)
```

## taxonomia_concepto

| Columna | Definición SQL |
|---|---|
| id | bigint unsigned NOT NULL AUTO_INCREMENT |
| concepto_estandar | varchar(150) NOT NULL |
| categoria | varchar(100) NOT NULL |
| alias_sec | varchar(255) DEFAULT NULL |
| alias_edinet | varchar(255) DEFAULT NULL |
| alias_finmind | varchar(255) DEFAULT NULL |
| descripcion | varchar(500) DEFAULT NULL |
| unidad_tipo | varchar(30) DEFAULT NULL |
| activo | tinyint(1) NOT NULL DEFAULT '1' |
| signo_esperado | enum('POSITIVO','NEGATIVO','VARIABLE') DEFAULT NULL |
| created_at | timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP |

Claves y relaciones:

```sql
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_concepto_estandar` (`concepto_estandar`),
  UNIQUE KEY `concepto_estandar` (`concepto_estandar`),
```

## valuation_execution

| Columna | Definición SQL |
|---|---|
| valuation_run_id | int NOT NULL |
| input_hash | char(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL |
| instrumento_id | int NOT NULL |
| input_json | longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL |
| trace_json | longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL |
| output_json | longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL |
| financial_state | varchar(40) NOT NULL |
| engine_version | varchar(20) NOT NULL |
| manifest_hash | char(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL |
| created_at | datetime NOT NULL DEFAULT CURRENT_TIMESTAMP |

Claves y relaciones:

```sql
  PRIMARY KEY (`valuation_run_id`),
  UNIQUE KEY `uq_execution_input` (`input_hash`),
  CONSTRAINT `fk_execution_instrumento` FOREIGN KEY (`instrumento_id`) REFERENCES `instrumento` (`id`),
  CONSTRAINT `fk_execution_run` FOREIGN KEY (`valuation_run_id`) REFERENCES `valuation_run` (`id`),
  CONSTRAINT `valuation_execution_chk_1` CHECK (json_valid(`input_json`)),
  CONSTRAINT `valuation_execution_chk_2` CHECK (json_valid(`trace_json`)),
  CONSTRAINT `valuation_execution_chk_3` CHECK (json_valid(`output_json`))
```

## valuation_input_snapshot

| Columna | Definición SQL |
|---|---|
| id | int NOT NULL AUTO_INCREMENT |
| empresa_id | int NOT NULL |
| fecha_valoracion | date NOT NULL |
| precio_usado | decimal(18,4) NOT NULL |
| fecha_precio | date NOT NULL |
| coste_capital_id | int NOT NULL |
| rating_sintetico_id | int DEFAULT NULL |
| interest_coverage | decimal(10,4) DEFAULT NULL |
| synthetic_rating | varchar(10) DEFAULT NULL |
| credit_spread | decimal(8,5) DEFAULT NULL |
| reporting_currency | varchar(3) NOT NULL DEFAULT 'USD' |
| valuation_currency | varchar(3) NOT NULL DEFAULT 'USD' |
| fx_rate_used | decimal(12,6) NOT NULL DEFAULT '1.000000' |
| created_at | datetime NOT NULL DEFAULT CURRENT_TIMESTAMP |

Claves y relaciones:

```sql
  PRIMARY KEY (`id`),
  CONSTRAINT `fk_snapshot_coste_capital` FOREIGN KEY (`coste_capital_id`) REFERENCES `coste_capital_referencia` (`id`),
  CONSTRAINT `fk_snapshot_empresa` FOREIGN KEY (`empresa_id`) REFERENCES `empresa` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_snapshot_rating` FOREIGN KEY (`rating_sintetico_id`) REFERENCES `rating_sintetico` (`id`)
```

## valuation_input_snapshot_detalle

| Columna | Definición SQL |
|---|---|
| id | int NOT NULL AUTO_INCREMENT |
| snapshot_id | int NOT NULL |
| valuation_input_version_id | int NOT NULL |
| orden_ejercicio | int NOT NULL |

Claves y relaciones:

```sql
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_visd_snapshot_viv` (`snapshot_id`,`valuation_input_version_id`),
  CONSTRAINT `fk_visd_snapshot` FOREIGN KEY (`snapshot_id`) REFERENCES `valuation_input_snapshot` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_visd_viv` FOREIGN KEY (`valuation_input_version_id`) REFERENCES `valuation_input_version` (`id`)
```

## valuation_input_version

| Columna | Definición SQL |
|---|---|
| id | int NOT NULL AUTO_INCREMENT |
| empresa_id | int NOT NULL |
| informe_id | int NOT NULL |
| tipo_periodo | varchar(30) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL |
| fuente_informe | varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL |
| fecha_fin_periodo | date NOT NULL |
| moneda | varchar(10) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL |
| ingresos | decimal(30,10) DEFAULT NULL |
| ebitda | decimal(30,10) DEFAULT NULL |
| depreciacion_amortizacion | decimal(30,10) DEFAULT NULL |
| ebit | decimal(30,10) DEFAULT NULL |
| gasto_intereses | decimal(30,10) DEFAULT NULL |
| beneficio_antes_impuestos | decimal(30,10) DEFAULT NULL |
| impuesto_beneficios | decimal(30,10) DEFAULT NULL |
| beneficio_neto | decimal(30,10) DEFAULT NULL |
| efectivo | decimal(30,10) DEFAULT NULL |
| deuda_corto_plazo | decimal(30,10) DEFAULT NULL |
| deuda_largo_plazo | decimal(30,10) DEFAULT NULL |
| deuda_total | decimal(30,10) DEFAULT NULL |
| deuda_neta | decimal(30,10) DEFAULT NULL |
| cuentas_cobrar | decimal(30,10) DEFAULT NULL |
| inventarios | decimal(30,10) DEFAULT NULL |
| cuentas_pagar | decimal(30,10) DEFAULT NULL |
| patrimonio_neto | decimal(30,10) DEFAULT NULL |
| activos_totales | decimal(30,10) DEFAULT NULL |
| pasivos_totales | decimal(30,10) DEFAULT NULL |
| capital_circulante_operativo | decimal(30,10) DEFAULT NULL |
| flujo_caja_operativo | decimal(30,10) DEFAULT NULL |
| capex | decimal(30,10) DEFAULT NULL |
| fcf | decimal(30,10) DEFAULT NULL |
| dividendos_pagados | decimal(30,10) DEFAULT NULL |
| acciones_en_circulacion | decimal(30,10) DEFAULT NULL |
| margen_ebit | decimal(20,10) DEFAULT NULL |
| margen_ebitda | decimal(20,10) DEFAULT NULL |
| margen_neto | decimal(20,10) DEFAULT NULL |
| margen_fcf | decimal(20,10) DEFAULT NULL |
| roa | decimal(20,10) DEFAULT NULL |
| roe | decimal(20,10) DEFAULT NULL |
| cobertura_intereses | decimal(30,10) DEFAULT NULL |
| nivel_confianza | enum('ALTA','MEDIA','BAJA') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL |
| hash_inputs | char(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL |
| created_at | datetime NOT NULL DEFAULT CURRENT_TIMESTAMP |

Claves y relaciones:

```sql
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_valuation_input_version` (`empresa_id`,`informe_id`,`hash_inputs`),
  CONSTRAINT `fk_valuation_input_empresa` FOREIGN KEY (`empresa_id`) REFERENCES `empresa` (`id`),
  CONSTRAINT `fk_valuation_input_informe` FOREIGN KEY (`informe_id`) REFERENCES `informe_financiero` (`id`)
```

## valuation_run

| Columna | Definición SQL |
|---|---|
| id | int NOT NULL AUTO_INCREMENT |
| empresa_id | int NOT NULL |
| input_snapshot_id | int NOT NULL |
| model_version_id | int NOT NULL |
| template_code | varchar(2) NOT NULL |
| valuation_method_family | varchar(20) NOT NULL |
| estado | enum('PREPARANDO','EJECUTANDO','COMPLETADO','ERROR') NOT NULL DEFAULT 'PREPARANDO' |
| engine_version | varchar(20) DEFAULT NULL |
| error_mensaje | varchar(500) DEFAULT NULL |
| fecha_inicio | datetime DEFAULT NULL |
| fecha_fin | datetime DEFAULT NULL |
| created_at | datetime NOT NULL DEFAULT CURRENT_TIMESTAMP |

Claves y relaciones:

```sql
  PRIMARY KEY (`id`),
  CONSTRAINT `fk_run_empresa` FOREIGN KEY (`empresa_id`) REFERENCES `empresa` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_run_model_version` FOREIGN KEY (`model_version_id`) REFERENCES `model_version` (`id`),
  CONSTRAINT `fk_run_snapshot` FOREIGN KEY (`input_snapshot_id`) REFERENCES `valuation_input_snapshot` (`id`)
```

## valuation_run_parametros

| Columna | Definición SQL |
|---|---|
| id | int NOT NULL AUTO_INCREMENT |
| valuation_run_id | int NOT NULL |
| escenario | enum('CONSERVATIVE','BASE','OPTIMISTIC') NOT NULL |
| ke | decimal(10,6) DEFAULT NULL |
| rf | decimal(10,6) DEFAULT NULL |
| beta | decimal(10,6) DEFAULT NULL |
| equity_risk_premium | decimal(10,6) DEFAULT NULL |
| spread_credito | decimal(10,6) DEFAULT NULL |
| kd | decimal(10,6) DEFAULT NULL |
| peso_patrimonio | decimal(10,6) DEFAULT NULL |
| peso_deuda | decimal(10,6) DEFAULT NULL |
| tasa_impositiva | decimal(10,6) DEFAULT NULL |
| wacc_base | decimal(10,6) DEFAULT NULL |
| prima_iliquidez | decimal(10,6) NOT NULL DEFAULT '0.000000' |
| prima_concentracion_clientes | decimal(10,6) NOT NULL DEFAULT '0.000000' |
| wacc_ajustado | decimal(10,6) DEFAULT NULL |
| created_at | datetime NOT NULL DEFAULT CURRENT_TIMESTAMP |

Claves y relaciones:

```sql
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_run_escenario` (`valuation_run_id`,`escenario`),
  CONSTRAINT `fk_parametros_valuation_run` FOREIGN KEY (`valuation_run_id`) REFERENCES `valuation_run` (`id`) ON DELETE CASCADE
```

## valuation_run_resultado

| Columna | Definición SQL |
|---|---|
| id | int NOT NULL AUTO_INCREMENT |
| valuation_run_id | int NOT NULL |
| escenario | enum('CONSERVATIVE','BASE','OPTIMISTIC') NOT NULL |
| fair_value | decimal(18,4) NOT NULL |
| max_buy_price | decimal(18,4) NOT NULL |
| current_price | decimal(18,4) NOT NULL |
| upside | decimal(8,4) NOT NULL |
| wacc | decimal(8,5) NOT NULL |
| terminal_growth | decimal(8,5) NOT NULL |
| decision | enum('BUY','WATCH','WAIT','DATA_PENDING') NOT NULL |
| confidence | enum('HIGH','MEDIUM','LOW') NOT NULL |
| validation_status | enum('APPROVED','REVIEW','BLOCKED') NOT NULL |
| created_at | datetime NOT NULL DEFAULT CURRENT_TIMESTAMP |

Claves y relaciones:

```sql
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_resultado_run_escenario` (`valuation_run_id`,`escenario`),
  CONSTRAINT `fk_resultado_run` FOREIGN KEY (`valuation_run_id`) REFERENCES `valuation_run` (`id`) ON DELETE CASCADE
```

