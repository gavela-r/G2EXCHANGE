-- Activo y pasivo corriente totales (partidas de balance) y KPI fondo de maniobra. Aditiva e idempotente.
INSERT IGNORE INTO taxonomia_concepto (concepto_estandar, categoria, alias_sec, alias_edinet, alias_finmind, descripcion, unidad_tipo, activo, signo_esperado)
VALUES
  ('ACTIVOS_CORRIENTES', 'BALANCE', 'AssetsCurrent', 'CurrentAssets', 'CurrentAssets',
   'Total del activo corriente publicado.', 'MONEDA', 1, 'POSITIVO'),
  ('PASIVOS_CORRIENTES', 'BALANCE', 'LiabilitiesCurrent', 'CurrentLiabilities', 'CurrentLiabilities',
   'Total del pasivo corriente publicado.', 'MONEDA', 1, 'POSITIVO'),
  ('FONDO_MANIOBRA', 'RATIO', 'CALCULADO', 'CALCULADO', 'CALCULADO',
   'Fondo de maniobra: activo corriente total menos pasivo corriente total.', 'MONEDA', 1, 'VARIABLE');
