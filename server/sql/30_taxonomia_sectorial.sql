-- 30_taxonomia_sectorial.sql — GENERADO por sectorial/app/tools/generar_migracion_taxonomia.cjs. NO EJECUTADO.
-- Ejecutar sólo en un esquema de desarrollo primero. Inserta conceptos INACTIVOS (activo=0): los recuperadores no los usan
-- hasta activarlos con reglas de extracción verificadas. Idempotente (INSERT IGNORE sobre uk_concepto_estandar).
START TRANSACTION;
INSERT IGNORE INTO taxonomia_concepto (concepto_estandar,categoria,alias_sec,alias_edinet,alias_finmind,descripcion,unidad_tipo,activo,signo_esperado) VALUES
('PRESTAMOS_BRUTOS','PRUDENCIAL_CONTRACTUAL','us-gaap:FinancingReceivableExcludingAccruedInterestBeforeAllowanceForCreditLoss|us-gaap:LoansAndLeasesReceivableGrossCarryingAmount','ifrs-full:LoansAndAdvancesToCustomers',NULL,'Campo motor: loans. Modelos: 13. ','MONEDA',0,NULL),
('PROVISION_INSOLVENCIAS','PRUDENCIAL_CONTRACTUAL','us-gaap:FinancingReceivableAllowanceForCreditLossExcludingAccruedInterest|us-gaap:FinancingReceivableAllowanceForCreditLosses','ifrs-full:LossAllowance',NULL,'Campo motor: allowance. Modelos: 13. ifrs-full:LossAllowance exige contexto de préstamos a coste amortizado','MONEDA',0,NULL),
('DEPOSITOS_CLIENTES','PRUDENCIAL_CONTRACTUAL','us-gaap:Deposits','ifrs-full:DepositsFromCustomers',NULL,'Campo motor: deposits. Modelos: 13. ','MONEDA',0,NULL),
('FINANCIACION_MAYORISTA','PRUDENCIAL_CONTRACTUAL','us-gaap:LongTermDebt|us-gaap:ShortTermBorrowings','ifrs-full:DebtSecuritiesIssued',NULL,'Campo motor: wholesale. Modelos: 13. Requiere desglose explícito; la deuda total no equivale por sí sola a financiación mayorista','MONEDA',0,NULL),
('OTROS_ACTIVOS_FINANCIEROS','PRUDENCIAL_CONTRACTUAL',NULL,NULL,NULL,'Campo motor: otherAssets. Modelos: 13,14. Partida residual SÓLO si el emisor la reporta; no se calcula por diferencia','MONEDA',0,NULL),
('CET1','PRUDENCIAL_CONTRACTUAL',NULL,NULL,NULL,'Campo motor: cet1. Modelos: 13. REGULATORIA (Pilar 3 / FR Y-9C / FSA); no XBRL financiero','MONEDA',0,NULL),
('ACTIVOS_PONDERADOS_RIESGO','PRUDENCIAL_CONTRACTUAL',NULL,NULL,NULL,'Campo motor: rwa. Modelos: 13. REGULATORIA','MONEDA',0,NULL),
('INVERSIONES_SEGUROS','PRUDENCIAL_CONTRACTUAL','us-gaap:Investments','ifrs-full:FinancialAssets',NULL,'Campo motor: investments. Modelos: 14. ifrs-full:FinancialAssets requiere perímetro de inversiones de la actividad aseguradora','MONEDA',0,NULL),
('PASIVO_CONTRATOS_SEGURO','PRUDENCIAL_CONTRACTUAL','us-gaap:LiabilityForFuturePolicyBenefits|us-gaap:LiabilityForClaimsAndClaimsAdjustmentExpense','ifrs-full:InsuranceContractsIssuedThatAreLiabilities',NULL,'Campo motor: insuranceLiability. Modelos: 14. US GAAP: suma de componentes declarados, nunca un único tag parcial','MONEDA',0,NULL),
('INGRESO_SEGUROS','PRUDENCIAL_CONTRACTUAL','us-gaap:PremiumsEarnedNet','ifrs-full:InsuranceRevenue',NULL,'Campo motor: insuranceRevenue. Modelos: 14. ','MONEDA',0,NULL),
('GASTO_SERVICIO_SEGUROS','PRUDENCIAL_CONTRACTUAL','us-gaap:PolicyholderBenefitsAndClaimsIncurredNet','ifrs-full:InsuranceServiceExpensesFromInsuranceContractsIssued',NULL,'Campo motor: claimsIncurred. Modelos: 14. ','MONEDA',0,NULL),
('REQUISITO_SOLVENCIA','PRUDENCIAL_CONTRACTUAL',NULL,NULL,NULL,'Campo motor: solvencyRequirement. Modelos: 14. REGULATORIA (SCR / RBC / ESR)','MONEDA',0,NULL),
('PROPIEDADES_INVERSION','SECTORIAL','us-gaap:RealEstateInvestmentPropertyNet','ifrs-full:InvestmentProperty',NULL,'Campo motor: investmentProperty. Modelos: 15. ','MONEDA',0,NULL),
('INGRESOS_ARRENDAMIENTO','SECTORIAL','us-gaap:OperatingLeaseLeaseIncome','ifrs-full:IncomeFromSubleasingRightofuseAssets',NULL,'Campo motor: rentalRevenue. Modelos: 15. Para arrendador: ifrs-full:LeaseIncome... según desglose','MONEDA',0,NULL),
('BASE_ACTIVOS_REGULADOS','SECTORIAL',NULL,NULL,NULL,'Campo motor: rab. Modelos: 10. REGULATORIA (decisión tarifaria)','MONEDA',0,NULL),
('INMOVILIZADO_REGULADO','SECTORIAL','us-gaap:PublicUtilitiesPropertyPlantAndEquipmentNet',NULL,NULL,'Campo motor: regulatedPPE. Modelos: 10. ','MONEDA',0,NULL),
('GASTO_I_D','SECTORIAL','us-gaap:ResearchAndDevelopmentExpense','ifrs-full:ResearchAndDevelopmentExpense',NULL,'Campo motor: rdExpense. Modelos: 12. ','MONEDA',0,NULL),
('OBLIGACIONES_DESEMPENO_PENDIENTES','SECTORIAL','us-gaap:RevenueRemainingPerformanceObligation','ifrs-full:RevenueFromContractsWithCustomersAllocatedToRemainingPerformanceObligations',NULL,'Campo motor: backlog. Modelos: 1,4. ','MONEDA',0,NULL),
('RESERVAS_PROBADAS','SECTORIAL','us-gaap:ProvedDevelopedAndUndevelopedReservesNet',NULL,NULL,'Campo motor: reserves. Modelos: 8,9. Unidad física declarada (bbl, boe, t); nunca mezclar unidades','UNIDADES',0,NULL),
('ACTIVOS_AGOTABLES','SECTORIAL','us-gaap:OilAndGasPropertySuccessfulEffortMethodNet|us-gaap:OilAndGasPropertyFullCostMethodNet|us-gaap:MineralPropertiesNet',NULL,NULL,'Campo motor: AGOTABLE. Modelos: 8,9. ','MONEDA',0,NULL),
('AGOTAMIENTO','SECTORIAL','us-gaap:DepletionOfOilAndGasProperties|us-gaap:Depletion',NULL,NULL,'Campo motor: depletion. Modelos: 8,9. ','MONEDA',0,NULL),
('PASIVO_IMPUESTO_CORRIENTE','FISCAL','us-gaap:AccruedIncomeTaxesCurrent','ifrs-full:CurrentTaxLiabilities',NULL,'Campo motor: taxPayable. Modelos: 1,2,3,4,5,6,7,8,9,10,11,12,15,16. ','MONEDA',0,NULL),
('ACTIVO_IMPUESTO_CORRIENTE','FISCAL','us-gaap:IncomeTaxesReceivable','ifrs-full:CurrentTaxAssets',NULL,'Campo motor: taxReceivable. Modelos: 1,2,3,4,5,6,7,8,9,10,11,12,15,16. ','MONEDA',0,NULL),
('ACTIVO_IMPUESTO_DIFERIDO','FISCAL','us-gaap:DeferredIncomeTaxAssetsNet','ifrs-full:DeferredTaxAssets',NULL,'Campo motor: deferredTaxAsset. Modelos: 1,2,3,4,5,6,7,8,9,10,11,12,15,16. ','MONEDA',0,NULL),
('PASIVO_IMPUESTO_DIFERIDO','FISCAL','us-gaap:DeferredIncomeTaxLiabilitiesNet','ifrs-full:DeferredTaxLiabilities',NULL,'Campo motor: deferredTaxLiability. Modelos: 1,2,3,4,5,6,7,8,9,10,11,12,15,16. ','MONEDA',0,NULL);
COMMIT;
