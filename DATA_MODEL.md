# Modelo de datos

## Tablas MySQL leídas (sólo lectura)
`empresa`, `pais`, `sector`, `instrumento`, `classification_evidence`, `informe_financiero` (tipo_periodo ANUAL, fecha_fin_periodo, fecha_publicacion, fuente, identificador_fuente), `partida_contable_valor` (importe, concepto, nivel_confianza), `taxonomia_concepto` (concepto_estandar, alias_sec, alias_edinet, unidad_tipo, activo), `pcv_verification_evidence` (informe_id, concept_code, provider, outcome, evidence_json), `financial_report_evidence`. Esquema base: `server/sql/00_schema.sql`.

## PCV → campo del motor
Mapeo en `sectorial/app/adapter.cjs` (`MAP`):

- **Resultados**: INGRESOS→revenue, COSTE_VENTAS→cogs, BENEFICIO_BRUTO→grossProfit, GASTOS_OPERATIVOS→opex, EBITDA→ebitda, EBIT→ebit, DEPRECIACION_AMORTIZACION→da, BENEFICIO_ANTES_IMPUESTOS→preTax, IMPUESTO_BENEFICIOS→taxExpense, BENEFICIO_NETO→netIncome, GASTO_INTERESES→interest.
- **Balance**: EFECTIVO→cash, ACTIVOS_TOTALES→assets, PASIVOS_TOTALES→liabilities, PATRIMONIO_NETO→equity, INVENTARIOS→inventory, CUENTAS_COBRAR→receivables, CUENTAS_PAGAR→payables, DEUDA_CORTO_PLAZO→shortDebt, DEUDA_LARGO_PLAZO→longDebt, DEUDA_TOTAL→totalDebtReported, INMOVILIZADO_MATERIAL→PPE, INMOVILIZADO_INTANGIBLE→INTANGIBLE, DERECHOS_USO→ROU, PASIVO_ARRENDAMIENTOS→leaseDebt, ACTIVOS/PASIVOS_CORRIENTES, ACTIVOS/PASIVOS_CONTRACTUALES.
- **Flujos y otros**: CAPEX→capex, FLUJO_CAJA_OPERATIVO/INVERSION/FINANCIACION→cfo/cfi/cff, DIVIDENDOS_PAGADOS→dividends, ACCIONES_EN_CIRCULACION→shares.
- **Derivados**: debt = shortDebt + longDebt; liabilitiesEquity = liabilities + equity; balanceDifference = assets − liabilitiesEquity.

## Estados de certificación de un PCV
| Estado | Regla |
|---|---|
| VALIDADO | Prueba INSERTED / NULL_FILLED / VERIFIED_EXISTING ligada al registro, con moneda, unidad, perímetro, período e identidad compatibles |
| CONFLICTIVO | Existe un CONFLICT_PRESERVED sobre el registro (tiene prioridad). El importe admitido es null y el original se conserva en `rawValue` |
| PENDIENTE | Presente sin prueba compatible, o concepto ausente (`reason`) |
| *CORROBORADO_IMPORTE_EXACTO* (propuesto) | Conflicto sólo por etiqueta con importe idéntico. **No aplicado** (ver `PCV_KPI_STATUS.md`) |

KPI (`sectorial/app/kpi.cjs`, mismas fórmulas que `server/insercionDatos/insercionKPIInformeFinanciero.ts`): `CERTIFICADO` (todas las entradas VALIDADO), `BLOQUEADO_DEPENDENCIA` (alguna entrada pendiente, conflictiva o ausente), `NO_CALCULABLE` (división por cero); aviso `DENOMINADOR_NEGATIVO`.

## Snapshot y ejecución
Un `Snapshot` (ver `sectorial/app/contracts/api.d.ts`) contiene la empresa, la clasificación, 4 períodos y un `inputHash`. Cada período lleva `fields` por concepto, con su estado, y `observations` con documento, proveedor, moneda, escala, norma, perímetro, verificación y hashes de evidencia. La ejecución guarda el snapshot, la configuración citada, el resultado y `engineHash`.

## Ampliación de taxonomía (propuesta, NO ejecutada)
`server/sql/30_taxonomia_sectorial.sql` (+ `.rollback.sql`), generada desde `sectorial/app/taxonomy.cjs` con `npm run sectorial:taxonomy:sql`. Contiene 25 conceptos **inactivos** (banca, seguros, REIT, utilities, farma, industriales/defensa, energía/minería y fiscalidad), con etiquetas XBRL candidatas equivalentes. Los conceptos REGULATORIOS (CET1, RWA, solvencia, RAB) no están en el XBRL financiero. El adaptador los mapeará cuando existan PCV con esos códigos (pendiente: ampliar `MAP` y volver a validar el motor).
