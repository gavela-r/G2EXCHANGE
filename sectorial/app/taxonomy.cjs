// Taxonomía: conceptos estándar existentes (mapeados por adapter.cjs) y ampliaciones sectoriales PROPUESTAS
// (migración server/sql/30_taxonomia_sectorial.sql, NO ejecutada). Las etiquetas XBRL son candidatas de extracción
// equivalentes; nunca se infieren desde conceptos no equivalentes. Fuente REGULATORIA = no está en XBRL financiero.
const{MAP}=require('./adapter.cjs');
const P=(code,field,sectors,unit,xbrl,note)=>({code,field,sectors,unit,xbrl,note:note??null,status:'PROPUESTO_PENDIENTE_MIGRACION'});
const PROPOSED=[
 P('PRESTAMOS_BRUTOS','loans',[13],'MONEDA',['us-gaap:FinancingReceivableExcludingAccruedInterestBeforeAllowanceForCreditLoss','us-gaap:LoansAndLeasesReceivableGrossCarryingAmount','ifrs-full:LoansAndAdvancesToCustomers']),
 P('PROVISION_INSOLVENCIAS','allowance',[13],'MONEDA',['us-gaap:FinancingReceivableAllowanceForCreditLossExcludingAccruedInterest','us-gaap:FinancingReceivableAllowanceForCreditLosses','ifrs-full:LossAllowance'],'ifrs-full:LossAllowance exige contexto de préstamos a coste amortizado'),
 P('DEPOSITOS_CLIENTES','deposits',[13],'MONEDA',['us-gaap:Deposits','ifrs-full:DepositsFromCustomers']),
 P('FINANCIACION_MAYORISTA','wholesale',[13],'MONEDA',['us-gaap:LongTermDebt','us-gaap:ShortTermBorrowings','ifrs-full:DebtSecuritiesIssued'],'Requiere desglose explícito; la deuda total no equivale por sí sola a financiación mayorista'),
 P('OTROS_ACTIVOS_FINANCIEROS','otherAssets',[13,14],'MONEDA',[],'Partida residual SÓLO si el emisor la reporta; no se calcula por diferencia'),
 P('CET1','cet1',[13],'MONEDA',[],'REGULATORIA (Pilar 3 / FR Y-9C / FSA); no XBRL financiero'),
 P('ACTIVOS_PONDERADOS_RIESGO','rwa',[13],'MONEDA',[],'REGULATORIA'),
 P('INVERSIONES_SEGUROS','investments',[14],'MONEDA',['us-gaap:Investments','ifrs-full:FinancialAssets'],'ifrs-full:FinancialAssets requiere perímetro de inversiones de la actividad aseguradora'),
 P('PASIVO_CONTRATOS_SEGURO','insuranceLiability',[14],'MONEDA',['ifrs-full:InsuranceContractsIssuedThatAreLiabilities','us-gaap:LiabilityForFuturePolicyBenefits','us-gaap:LiabilityForClaimsAndClaimsAdjustmentExpense'],'US GAAP: suma de componentes declarados, nunca un único tag parcial'),
 P('INGRESO_SEGUROS','insuranceRevenue',[14],'MONEDA',['ifrs-full:InsuranceRevenue','us-gaap:PremiumsEarnedNet']),
 P('GASTO_SERVICIO_SEGUROS','claimsIncurred',[14],'MONEDA',['ifrs-full:InsuranceServiceExpensesFromInsuranceContractsIssued','us-gaap:PolicyholderBenefitsAndClaimsIncurredNet']),
 P('REQUISITO_SOLVENCIA','solvencyRequirement',[14],'MONEDA',[],'REGULATORIA (SCR / RBC / ESR)'),
 P('PROPIEDADES_INVERSION','investmentProperty',[15],'MONEDA',['ifrs-full:InvestmentProperty','us-gaap:RealEstateInvestmentPropertyNet']),
 P('INGRESOS_ARRENDAMIENTO','rentalRevenue',[15],'MONEDA',['us-gaap:OperatingLeaseLeaseIncome','ifrs-full:IncomeFromSubleasingRightofuseAssets'],'Para arrendador: ifrs-full:LeaseIncome... según desglose'),
 P('BASE_ACTIVOS_REGULADOS','rab',[10],'MONEDA',[],'REGULATORIA (decisión tarifaria)'),
 P('INMOVILIZADO_REGULADO','regulatedPPE',[10],'MONEDA',['us-gaap:PublicUtilitiesPropertyPlantAndEquipmentNet']),
 P('GASTO_I_D','rdExpense',[12],'MONEDA',['us-gaap:ResearchAndDevelopmentExpense','ifrs-full:ResearchAndDevelopmentExpense']),
 P('OBLIGACIONES_DESEMPENO_PENDIENTES','backlog',[1,4],'MONEDA',['us-gaap:RevenueRemainingPerformanceObligation','ifrs-full:RevenueFromContractsWithCustomersAllocatedToRemainingPerformanceObligations']),
 P('RESERVAS_PROBADAS','reserves',[8,9],'UNIDADES',['us-gaap:ProvedDevelopedAndUndevelopedReservesNet'],'Unidad física declarada (bbl, boe, t); nunca mezclar unidades'),
 P('ACTIVOS_AGOTABLES','AGOTABLE',[8,9],'MONEDA',['us-gaap:OilAndGasPropertySuccessfulEffortMethodNet','us-gaap:OilAndGasPropertyFullCostMethodNet','us-gaap:MineralPropertiesNet']),
 P('AGOTAMIENTO','depletion',[8,9],'MONEDA',['us-gaap:DepletionOfOilAndGasProperties','us-gaap:Depletion']),
 P('PASIVO_IMPUESTO_CORRIENTE','taxPayable',[1,2,3,4,5,6,7,8,9,10,11,12,15,16],'MONEDA',['us-gaap:AccruedIncomeTaxesCurrent','ifrs-full:CurrentTaxLiabilities']),
 P('ACTIVO_IMPUESTO_CORRIENTE','taxReceivable',[1,2,3,4,5,6,7,8,9,10,11,12,15,16],'MONEDA',['us-gaap:IncomeTaxesReceivable','ifrs-full:CurrentTaxAssets']),
 P('ACTIVO_IMPUESTO_DIFERIDO','deferredTaxAsset',[1,2,3,4,5,6,7,8,9,10,11,12,15,16],'MONEDA',['us-gaap:DeferredIncomeTaxAssetsNet','ifrs-full:DeferredTaxAssets']),
 P('PASIVO_IMPUESTO_DIFERIDO','deferredTaxLiability',[1,2,3,4,5,6,7,8,9,10,11,12,15,16],'MONEDA',['us-gaap:DeferredIncomeTaxLiabilitiesNet','ifrs-full:DeferredTaxLiabilities'])
];
const describe=()=>({existing:Object.entries(MAP).map(([code,field])=>({code,field,status:'MAPEADO'})),derived:[{field:'debt',from:['shortDebt','longDebt']},{field:'liabilitiesEquity',from:['liabilities','equity']},{field:'balanceDifference',from:['assets','liabilitiesEquity']}],proposed:PROPOSED,migration:'server/sql/30_taxonomia_sectorial.sql (no ejecutada; rollback 30_taxonomia_sectorial.rollback.sql)'});
module.exports={PROPOSED,describe};
