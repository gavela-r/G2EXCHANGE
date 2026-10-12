-- PROPUESTA NO APLICADA. Cambios solo en NUEVAS versiones; originales y snapshots intactos.
-- Solo discrepancia exactamente -1 día y pertenencia del informe a la empresa.
-- Conteo observado 12/10/2026: 88.464 candidatas / 88.468 versiones.
-- Esta reparación es solo de fecha; no convierte ceros históricos en datos auditados.
CREATE TABLE valuation_date_repair (
 old_version_id INT NOT NULL PRIMARY KEY,
 new_version_id INT NULL UNIQUE,
 fecha_anterior DATE NOT NULL,
 fecha_correcta DATE NOT NULL,
 hash_correcto CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;
START TRANSACTION;
INSERT INTO valuation_date_repair (old_version_id,fecha_anterior,fecha_correcta,hash_correcto)
SELECT v.id,v.fecha_fin_periodo,i.fecha_fin_periodo,
 SHA2(CONCAT('CIVIL_DATE_REPAIR_V1|',v.hash_inputs,'|',DATE_FORMAT(i.fecha_fin_periodo,'%Y-%m-%d')),256)
FROM valuation_input_version v JOIN informe_financiero i ON i.id=v.informe_id AND i.empresa_id=v.empresa_id
WHERE DATEDIFF(v.fecha_fin_periodo,i.fecha_fin_periodo)=-1
ON DUPLICATE KEY UPDATE old_version_id=valuation_date_repair.old_version_id;
INSERT INTO valuation_input_version (empresa_id,informe_id,tipo_periodo,fuente_informe,fecha_fin_periodo,moneda,ingresos,ebitda,depreciacion_amortizacion,ebit,gasto_intereses,beneficio_antes_impuestos,impuesto_beneficios,beneficio_neto,efectivo,cuentas_cobrar,inventarios,cuentas_pagar,deuda_corto_plazo,deuda_largo_plazo,deuda_total,deuda_neta,patrimonio_neto,activos_totales,pasivos_totales,capital_circulante_operativo,flujo_caja_operativo,capex,fcf,dividendos_pagados,acciones_en_circulacion,margen_ebit,margen_ebitda,margen_neto,margen_fcf,roa,roe,cobertura_intereses,nivel_confianza,hash_inputs)
SELECT v.empresa_id,v.informe_id,v.tipo_periodo,v.fuente_informe,r.fecha_correcta,v.moneda,v.ingresos,v.ebitda,v.depreciacion_amortizacion,v.ebit,v.gasto_intereses,v.beneficio_antes_impuestos,v.impuesto_beneficios,v.beneficio_neto,v.efectivo,v.cuentas_cobrar,v.inventarios,v.cuentas_pagar,v.deuda_corto_plazo,v.deuda_largo_plazo,v.deuda_total,v.deuda_neta,v.patrimonio_neto,v.activos_totales,v.pasivos_totales,v.capital_circulante_operativo,v.flujo_caja_operativo,v.capex,v.fcf,v.dividendos_pagados,v.acciones_en_circulacion,v.margen_ebit,v.margen_ebitda,v.margen_neto,v.margen_fcf,v.roa,v.roe,v.cobertura_intereses,v.nivel_confianza,r.hash_correcto
FROM valuation_date_repair r JOIN valuation_input_version v ON v.id=r.old_version_id
LEFT JOIN valuation_input_version n ON n.empresa_id=v.empresa_id AND n.informe_id=v.informe_id AND n.hash_inputs=r.hash_correcto
WHERE n.id IS NULL;
UPDATE valuation_date_repair r JOIN valuation_input_version v ON v.id=r.old_version_id
JOIN valuation_input_version n ON n.empresa_id=v.empresa_id AND n.informe_id=v.informe_id AND n.hash_inputs=r.hash_correcto
SET r.new_version_id=n.id;
-- Verificar conteo, fecha e igualdad de campos numéricos antes de COMMIT.
SELECT COUNT(*) candidatas,SUM(new_version_id IS NULL) sin_version FROM valuation_date_repair;
-- COMMIT requiere autorización; por defecto el ensayo se revierte.
ROLLBACK;
-- DDL no se revierte con ROLLBACK. Conservar ledger para revisión.
-- Reversión tras COMMIT: detener workers; si existen detalles ligados a new_version_id,
-- conservar ambas versiones y los resultados. No borrar versiones referenciadas.
-- Si no están referenciadas, archivar nuevas filas antes de cualquier retirada autorizada.
-- Nunca modificar old_version_id ni enlaces de snapshots originales.
