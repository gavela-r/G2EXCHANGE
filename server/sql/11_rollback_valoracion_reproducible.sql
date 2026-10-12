-- Workers detenidos, copia de seguridad verificada. Reversión sin borrar históricos:
RENAME TABLE valuation_execution TO valuation_execution_archived_v1;
-- Volver a código anterior/desactivar --write. Conservar model_version 1.5.1 si referenciada.
