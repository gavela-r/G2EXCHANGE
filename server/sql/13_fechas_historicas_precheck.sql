-- SOLO LECTURA. Fuente: informe_financiero.fecha_fin_periodo, no fecha +1 ciega.
SELECT DATEDIFF(v.fecha_fin_periodo,i.fecha_fin_periodo) desplazamiento,COUNT(*) registros
FROM valuation_input_version v JOIN informe_financiero i ON i.id=v.informe_id GROUP BY desplazamiento;
-- No UPDATE in-place: invalidaría hash_inputs y snapshots históricos.
-- Generar nuevas versiones con el generador corregido. Conservar las anteriores.
-- Rollback: detener workers y volver a IDs de versiones/runs anteriores; no borrar históricos.
