-- KPI DFN/EBITDA (deuda financiera neta / EBITDA, en veces). Aditiva e idempotente.
INSERT IGNORE INTO taxonomia_concepto (concepto_estandar, categoria, alias_sec, alias_edinet, alias_finmind, descripcion, unidad_tipo, activo, signo_esperado)
VALUES ('DEUDA_NETA_SOBRE_EBITDA', 'RATIO', 'CALCULADO', 'CALCULADO', 'CALCULADO',
        'DFN/EBITDA: deuda financiera neta (deuda total menos efectivo) dividida entre EBITDA. Solo con EBITDA positivo.', 'VECES', 1, 'VARIABLE');
