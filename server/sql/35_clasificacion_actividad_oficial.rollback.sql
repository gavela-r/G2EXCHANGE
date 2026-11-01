-- Rollback de la clasificación por código oficial de actividad (sólo filas de sus dos criterios).
DELETE FROM classification_evidence WHERE criterion IN ('SEC_SIC_PLANTILLA_V1','TSE33_PLANTILLA_V1');
