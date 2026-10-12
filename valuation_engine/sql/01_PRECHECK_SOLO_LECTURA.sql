-- SOLO LECTURA. Ejecutar en DBeaver antes de integrar.
SELECT DATABASE() AS base_datos;
SELECT TABLE_NAME,COLUMN_NAME,DATA_TYPE
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA=DATABASE()
AND TABLE_NAME IN ('empresa','instrumento','pais','sector','rating_sintetico',
 'valuation_input_version','valuation_run','valuation_input_snapshot','valuation_input_snapshot_detalle','valuation_run_parametros')
ORDER BY TABLE_NAME,ORDINAL_POSITION;
SELECT p.codigo_iso, COUNT(*) AS referencias_con_ke
FROM coste_capital_referencia c JOIN pais p ON p.id=c.pais_id
WHERE p.codigo_iso IN ('US','JP','TW') AND c.ke_referencia IS NOT NULL
GROUP BY p.codigo_iso;
