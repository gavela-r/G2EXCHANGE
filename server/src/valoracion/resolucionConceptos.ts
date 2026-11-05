// Resolución determinista de conceptos de origen -> concepto estándar.
//
// Problema que resuelve: varios conceptos XBRL/FinMind distintos estaban mapeados al
// mismo concepto estándar (p. ej. "Depreciation" y "DepreciationAndAmortization", o
// "NetSales" y "NetSalesSummaryOfBusinessResults"). normalizarPartidas lanzaba
// TAXONOMIA_AMBIGUA y el informe entero quedaba inutilizable para KPI y valoración.
//
// Política (contrastada con las taxonomías US-GAAP, JGAAP/IFRS de EDINET y TIFRS):
//  1. EXCLUIR conceptos que no representan el concepto estándar (errores de mapeo
//     comprobados: pasivo total como deuda, ingresos diferidos como ingresos, etc.).
//  2. Si hay un AGREGADO publicado, usarlo (prioridad explícita, primero el más amplio
//     y propio del estado financiero principal; los "SummaryOfBusinessResults" de
//     EDINET quedan detrás del estado principal para mantener el mismo perímetro).
//  3. Para deuda sin agregado: SUMAR componentes disjuntos de balance documentados
//     (p. ej. préstamos CP + parte corriente de préstamos LP + parte corriente de bonos).
//  4. Si el concepto no figura en ninguna lista, se deja tal cual: la detección de
//     ambigüedad posterior sigue protegiendo contra combinaciones no contrastadas.
//
// Nunca se inventan importes: sólo se selecciona o suma lo que la fuente publica,
// y cada decisión queda registrada en `notas` (trazabilidad en calidad/advertencias).

export interface FilaPartida { concepto_estandar: string; concepto: string; importe: unknown }
export interface NotaResolucion { concepto: string; regla: string; usados: string[]; descartados: string[] }

const local = (c: string) => c.split(':').pop()!.trim();
const lc = (c: string) => local(c).toLowerCase();

type Fuente = 'SEC_EDGAR' | 'EDINET' | 'FINMIND' | string;

// --- 1. Exclusiones (nombre local, insensible a mayúsculas) -------------------------
const EXCLUIR: Record<string, RegExp> = {
  INVENTARIOS: /writedown|reversal|increase|decrease|changein|impairment/i,
  INGRESOS: /^(unearnedrevenue|costofsales|costofsalesifrs|interestincomeexpensenonoperatingnet|othercomprehensiveincome)$|costofsales$/i,
  EBIT: /^(nonoperatingincome|nonoperatingexpenses|ordinaryincome)$/i,
  IMPUESTO_BENEFICIOS: /^(incomebeforeincometaxes|-)$/i,
  GASTO_INTERESES: /^(-|expense|financeleaseinterestexpense|interestexpenserelatedparty|interestcostsincurred)$/i,
  BENEFICIO_BRUTO: /^-$/,
  // Arrendamientos puros fuera de la deuda financiera (coherente con el alias principal LongTermDebtNoncurrent).
  DEUDA_CORTO_PLAZO: /^(liabilities|longtermborrowings|longtermloanspayable|bondspayable|financeleaseliabilitycurrent|leaseobligationscl|leaseliabilitiesclifrs)$/i,
  DEUDA_LARGO_PLAZO: /^(liabilities|longtermdebtcurrent|longtermdebtfairvalue|shorttermbondspayable|financeleaseliabilitynoncurrent|leaseobligationsncl|leaseliabilitiesnclifrs|longtermleaseobligationsncl)$|^currentportion|(?<!n)cl(ifrs)?$/i,
  CUENTAS_COBRAR: /^(otherreceivablesnetcurrent|accountsreceivableduefromrelatedpartiesnet)$/i,
  CUENTAS_PAGAR: /^(accruedliabilitiescurrent|otherpayables|accountspayableothercurrent)$/i,
  DEPRECIACION_AMORTIZACION: /^(amortizationofdeferredcharges)$/i,
  BENEFICIO_NETO: /^(comprehensiveincomeconsolidatednetincomeattributednoncontrollinginterest)$/i,
};

// --- 2. Prioridad de agregados (primero = preferido) --------------------------------
const PRIORIDAD: Record<string, string[]> = {
  INGRESOS: [
    'Revenues', 'RevenueFromContractWithCustomerExcludingAssessedTax', 'RevenueFromContractWithCustomerIncludingAssessedTax',
    'RevenuesNetOfInterestExpense', 'RegulatedAndUnregulatedOperatingRevenue', 'InterestAndDividendIncomeOperating',
    'NetSales', 'RevenueIFRS', 'OperatingRevenue', 'GrossOperatingRevenue', 'Revenue', 'NetSalesOfCompletedConstructionContractsCNS',
    'NetSalesSummaryOfBusinessResults', 'RevenueIFRSSummaryOfBusinessResults', 'OperatingRevenue1SummaryOfBusinessResults',
    'GrossOperatingRevenueSummaryOfBusinessResults', 'OperatingRevenue2SummaryOfBusinessResults', 'RevenuesUSGAAPSummaryOfBusinessResults',
    'OrdinaryIncomeSummaryOfBusinessResults', 'RevenueKeyFinancialData',
  ],
  EBIT: ['OperatingIncomeLoss', 'OperatingProfitLossIFRS', 'OperatingIncome'],
  IMPUESTO_BENEFICIOS: ['IncomeTaxExpenseBenefit', 'IncomeTaxExpenseIFRS', 'IncomeTaxes', 'TAX', 'IncomeTaxesCurrent'],
  FLUJO_CAJA_OPERATIVO: [
    'NetCashProvidedByUsedInOperatingActivities', 'NetCashProvidedByUsedInOperatingActivitiesIFRS', 'CashFlowsFromOperatingActivities',
    'NetCashProvidedByUsedInOperatingActivitiesContinuingOperations', 'NetCashProvidedByUsedInOperatingActivitiesSummaryOfBusinessResults',
    'CashFlowsFromUsedInOperatingActivitiesIFRSSummaryOfBusinessResults',
  ],
  DEPRECIACION_AMORTIZACION: [
    'DepreciationDepletionAndAmortization', 'DepreciationAndAmortization', 'DepreciationAmortizationAndAccretionNet',
    'DepreciationAndAmortizationOpeCF', 'DepreciationAndAmortizationOpeCFIFRS', 'Depreciation',
  ],
  CUENTAS_COBRAR: [
    'AccountsReceivableNetCurrent', 'AccountsReceivableNet', 'ReceivablesNetCurrent', 'AccountsAndOtherReceivablesNetCurrent',
    'AccountsNotesAndLoansReceivableNetCurrent', 'AccountsAndNotesReceivableNet', 'AccountsReceivableGrossCurrent',
    'NotesAndAccountsReceivableTradeAndContractAssets', 'NotesAndAccountsReceivableTrade', 'TradeAndOtherReceivablesCAIFRS',
    'AccountsReceivableTrade',
  ],
  CUENTAS_PAGAR: [
    'AccountsPayableCurrent', 'AccountsPayableTradeCurrent', 'AccountsPayableAndAccruedLiabilitiesCurrent',
    'AccountsPayableCurrentAndNoncurrent', 'AccountsPayableAndOtherAccruedLiabilities',
    'NotesAndAccountsPayableTrade', 'TradeAndOtherPayablesCLIFRS', 'AccountsPayableTrade',
    'NotesPayableAccountsPayableForConstructionContractsAndOtherCNS', 'AccountsPayable',
  ],
  INVENTARIOS: ['InventoryNet', 'Inventories', 'InventoriesCAIFRS', 'InventoryNetOfAllowancesCustomerAdvancesAndProgressBillings', 'InventoryGross'],
  EFECTIVO: ['CashAndCashEquivalentsAtCarryingValue', 'CashAndCashEquivalents', 'CashAndCashEquivalentsIFRS', 'CashAndDeposits', 'Cash', 'CashAndDueFromBanks', 'CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents'],
  BENEFICIO_NETO: ['NetIncomeLoss', 'ProfitLossAttributableToOwnersOfParent', 'ProfitLossAttributableToOwnersOfParentIFRS', 'IncomeAfterTaxes', 'ProfitLoss', 'TotalConsolidatedProfitForThePeriod', 'NetIncomeLossAvailableToCommonStockholdersBasic'],
  PATRIMONIO_NETO: ['StockholdersEquity', 'EquityAttributableToOwnersOfParentIFRS', 'NetAssets', 'Equity', 'StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest', 'PartnersCapital'],
  ACCIONES_EN_CIRCULACION: ['CommonStockSharesOutstanding', 'EntityCommonStockSharesOutstanding', 'SharesOutstanding', 'NumberOfSharesIssued'],
  GASTO_INTERESES: ['InterestExpense', 'InterestAndDebtExpense', 'InterestExpenseDebt', 'InterestExpenseNonoperating', 'InterestExpensesNOE', 'FinanceCostsIFRS', 'InterestExpenseOperating', 'InterestExpenseBorrowings', 'InterestExpensesOpeCF'],
  CAPEX: ['PaymentsToAcquirePropertyPlantAndEquipment', 'PaymentsToAcquireProductiveAssets', 'PurchaseOfPropertyPlantAndEquipmentInvCF', 'PurchaseOfPropertyPlantAndEquipmentInvCFIFRS', 'PropertyAndPlantAndEquipment'],
  BENEFICIO_ANTES_IMPUESTOS: ['IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest', 'IncomeLossFromContinuingOperationsBeforeIncomeTaxesMinorityInterestAndIncomeLossFromEquityMethodInvestments', 'ProfitLossBeforeTaxIFRS', 'IncomeBeforeIncomeTaxes', 'NetIncomeBeforeTax'],
  DIVIDENDOS_PAGADOS: ['PaymentsOfDividends', 'PaymentsOfDividendsCommonStock', 'PaymentsOfOrdinaryDividends', 'CashDividendsPaidFinCF', 'DividendsPaidFinCFIFRS'],
};

// --- 3. Deuda: agregados y componentes disjuntos -------------------------------------
const COMPONENTES: Record<string, { agregados: string[]; base: string[]; familiaUnica: string[] }> = {
  DEUDA_CORTO_PLAZO: {
    // Agregados publicados de toda la deuda financiera corriente.
    agregados: ['DebtCurrent', 'InterestBearingLiabilitiesCLIFRS', 'BondsAndBorrowingsCLIFRS', 'BorrowingsCLIFRS'],
    // Componentes disjuntos: cada línea de balance se suma una vez.
    base: ['LongTermDebtCurrent', 'LongTermDebtAndCapitalLeaseObligationsCurrent', 'ShortTermLoansPayable', 'CurrentPortionOfLongTermLoansPayable',
      'CurrentPortionOfBonds', 'ShortTermBondsPayable', 'CommercialPapersLiabilities', 'CurrentPortionOfBondsWithSubscriptionRightsToShares',
      'CurrentPortionOfLongTermBorrowingsCLIFRS', 'ShorttermBorrowings'],
    // Préstamos a corto US: pueden solaparse entre sí; sólo se toma el de mayor prioridad.
    familiaUnica: ['ShortTermBorrowings', 'CommercialPaper', 'LinesOfCreditCurrent', 'LineOfCredit', 'NotesPayableCurrent', 'LoansPayableCurrent',
      'NotesAndLoansPayableCurrent', 'OtherShortTermBorrowings', 'LoansPayableToBankCurrent', 'ConvertibleNotesPayableCurrent',
      'ConvertibleDebtCurrent', 'SecuredDebtCurrent', 'UnsecuredDebtCurrent', 'SeniorNotesCurrent', 'OtherLoansPayableCurrent'],
  },
  DEUDA_LARGO_PLAZO: {
    agregados: ['LongTermDebtNoncurrent', 'LongTermDebtAndCapitalLeaseObligations', 'InterestBearingLiabilitiesNCLIFRS', 'BondsAndBorrowingsNCLIFRS', 'LongTermDebtNCLIFRS', 'BorrowingsNCLIFRS'],
    base: ['LongTermLoansPayable', 'BondsPayable', 'LongtermBorrowings'],
    familiaUnica: ['LongTermNotesPayable', 'SeniorNotes', 'SeniorLongTermNotes', 'ConvertibleDebtNoncurrent', 'ConvertibleNotesPayable',
      'LongTermLoansFromBank', 'LongTermNotesAndLoans', 'OtherLongTermDebtNoncurrent', 'SecuredDebt', 'UnsecuredDebt', 'LongTermLineOfCredit',
      'NotesPayable', 'SubordinatedLongTermDebt'],
  },
  // JGAAP publica las existencias por líneas disjuntas (商品及び製品, 仕掛品, 原材料及び貯蔵品...).
  INVENTARIOS: {
    agregados: ['InventoryNet', 'Inventories', 'InventoriesCAIFRS', 'InventoryNetOfAllowancesCustomerAdvancesAndProgressBillings', 'InventoryGross'],
    base: ['MerchandiseAndFinishedGoods', 'Merchandise', 'FinishedGoods', 'WorkInProcess', 'RawMaterialsAndSupplies', 'RawMaterials', 'Supplies', 'OtherInventories', 'CostsOnUncompletedConstructionContractsCNS', 'RealEstateForSaleRES'],
    familiaUnica: [],
  },
  // Depreciación y amortización de intangibles son disjuntas cuando no hay agregado D&A.
  DEPRECIACION_AMORTIZACION: {
    agregados: ['DepreciationDepletionAndAmortization', 'DepreciationAndAmortization', 'DepreciationAndAmortizationOpeCF', 'DepreciationAndAmortizationOpeCFIFRS', 'DepreciationAmortizationAndAccretionNet'],
    base: ['Depreciation', 'AmortizationOfIntangibleAssets', 'AmortizationExpense'],
    familiaUnica: [],
  },
};

function numero(v: unknown): number | undefined {
  if (v === null || v === undefined || v === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function idx(lista: string[], c: string) { const l = lc(c); return lista.findIndex(x => x.toLowerCase() === l); }

/**
 * Devuelve las filas con, como máximo, un importe por concepto estándar resuelto por regla.
 * Las filas de conceptos sin regla se devuelven intactas.
 */
export function resolverPartidas<T extends FilaPartida>(rows: T[], _fuente: Fuente): { rows: T[]; notas: NotaResolucion[] } {
  const notas: NotaResolucion[] = [];
  const porConcepto = new Map<string, T[]>();
  for (const r of rows) {
    const k = String(r.concepto_estandar).toUpperCase();
    if (!porConcepto.has(k)) porConcepto.set(k, []);
    porConcepto.get(k)!.push(r);
  }
  // Para la regla "LongTermDebt total - parte corriente" se necesita la parte corriente publicada.
  const corrienteLTD = (porConcepto.get('DEUDA_CORTO_PLAZO') ?? []).concat(porConcepto.get('DEUDA_LARGO_PLAZO') ?? [])
    .filter(r => /^longtermdebtcurrent$/i.test(local(r.concepto))).map(r => numero(r.importe)).find(v => v !== undefined);

  const salida: T[] = [];
  for (const [k, grupo] of porConcepto) {
    const excl = EXCLUIR[k];
    const validos = excl ? grupo.filter(r => !excl.test(local(r.concepto))) : grupo;
    const descartados = grupo.filter(r => !validos.includes(r)).map(r => r.concepto);
    const conImporte = validos.filter(r => numero(r.importe) !== undefined);
    const distintos = new Set(conImporte.map(r => numero(r.importe)));
    if (descartados.length) notas.push({ concepto: k, regla: 'EXCLUIDO_MAPEO_INCOMPATIBLE', usados: [], descartados });
    if (distintos.size <= 1) { salida.push(...validos); continue; }

    if (COMPONENTES[k]) {
      const d = COMPONENTES[k];
      const agg = d.agregados.map(a => conImporte.find(r => lc(r.concepto) === a.toLowerCase())).find(Boolean);
      if (agg) { salida.push(agg); notas.push({ concepto: k, regla: 'AGREGADO_PUBLICADO', usados: [agg.concepto], descartados: conImporte.filter(r => r !== agg).map(r => r.concepto) }); continue; }
      // US: LongTermDebt es deuda LP total (incluye corriente). Se resta la parte corriente publicada.
      const ltdTotal = k === 'DEUDA_LARGO_PLAZO' ? conImporte.find(r => lc(r.concepto) === 'longtermdebt') : undefined;
      if (ltdTotal) {
        const total = numero(ltdTotal.importe)!;
        const v = corrienteLTD !== undefined && corrienteLTD <= total ? total - corrienteLTD : total;
        salida.push({ ...ltdTotal, importe: v });
        notas.push({ concepto: k, regla: corrienteLTD !== undefined ? 'LTD_TOTAL_MENOS_CORRIENTE' : 'LTD_TOTAL_SIN_CORRIENTE_PUBLICADA', usados: [ltdTotal.concepto], descartados: conImporte.filter(r => r !== ltdTotal).map(r => r.concepto) });
        continue;
      }
      const usados: T[] = [];
      const vistos = new Set<string>();
      for (const r of conImporte) if (idx(d.base, r.concepto) >= 0 && !vistos.has(lc(r.concepto))) { usados.push(r); vistos.add(lc(r.concepto)); }
      const fam = d.familiaUnica.map(a => conImporte.find(r => lc(r.concepto) === a.toLowerCase())).find(Boolean);
      if (fam) usados.push(fam);
      const sinRegla = conImporte.filter(r => idx(d.base, r.concepto) < 0 && idx(d.familiaUnica, r.concepto) < 0);
      if (usados.length && !sinRegla.length) {
        const suma = usados.reduce((s, r) => s + numero(r.importe)!, 0);
        salida.push({ ...usados[0], concepto: usados.length > 1 ? `SUMA(${usados.map(r => local(r.concepto)).join('+')})` : usados[0].concepto, importe: suma });
        notas.push({ concepto: k, regla: usados.length > 1 ? 'SUMA_COMPONENTES_DISJUNTOS' : 'COMPONENTE_UNICO', usados: usados.map(r => r.concepto), descartados: conImporte.filter(r => !usados.includes(r)).map(r => r.concepto) });
        continue;
      }
      salida.push(...validos); // combinación no contrastada: se deja que la detección de ambigüedad bloquee.
      continue;
    }

    const prio = PRIORIDAD[k];
    if (prio) {
      const elegido = prio.map(a => conImporte.find(r => lc(r.concepto) === a.toLowerCase())).find(Boolean);
      if (elegido) {
        salida.push(elegido);
        notas.push({ concepto: k, regla: 'PRIORIDAD_AGREGADO', usados: [elegido.concepto], descartados: conImporte.filter(r => numero(r.importe) !== numero(elegido.importe)).map(r => r.concepto) });
        continue;
      }
    }
    salida.push(...validos);
  }
  return { rows: salida, notas };
}
