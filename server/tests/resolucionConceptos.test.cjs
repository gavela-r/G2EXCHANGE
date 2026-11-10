const { test } = require('node:test');
const assert = require('node:assert/strict');
const { resolverPartidas } = require('../dist/src/valoracion/resolucionConceptos');
const { normalizarPartidas } = require('../dist/src/valoracion/datos');
const { kpiCalcularInforme } = require('../dist/insercionDatos/insercionKPIInformeFinanciero');

const fila = (concepto_estandar, concepto, importe) => ({ concepto_estandar, concepto, importe, signo_esperado: 'VARIABLE' });
const kpi = (vals, k) => kpiCalcularInforme(1, vals).find(x => x.kpi === k);

test('DFN/EBITDA = (deuda CP + LP - efectivo) / (EBIT + D&A)', () => {
  const v = { EBIT: 80, DEPRECIACION_AMORTIZACION: 20, DEUDA_CORTO_PLAZO: 50, DEUDA_LARGO_PLAZO: 150, EFECTIVO: 40, INGRESOS: 500 };
  const r = kpi(v, 'DEUDA_NETA_SOBRE_EBITDA');
  assert.equal(r.unidad, 'VECES');
  assert.equal(r.valor, (200 - 40) / 100);
});
test('DFN/EBITDA negativo (caja neta) es válido; con EBITDA <= 0 o deuda incompleta no se calcula', () => {
  assert.equal(kpi({ EBIT: 10, DEPRECIACION_AMORTIZACION: 0, DEUDA_CORTO_PLAZO: 0, DEUDA_LARGO_PLAZO: 0, EFECTIVO: 30 }, 'DEUDA_NETA_SOBRE_EBITDA').valor, -3);
  assert.equal(kpi({ EBIT: -10, DEPRECIACION_AMORTIZACION: 5, DEUDA_CORTO_PLAZO: 1, DEUDA_LARGO_PLAZO: 1, EFECTIVO: 0 }, 'DEUDA_NETA_SOBRE_EBITDA'), undefined);
  assert.equal(kpi({ EBIT: 10, DEPRECIACION_AMORTIZACION: 5, DEUDA_LARGO_PLAZO: 1, EFECTIVO: 0 }, 'DEUDA_NETA_SOBRE_EBITDA'), undefined);
});
test('Prioridad: D&A agregado prevalece sobre la depreciación sola (antes TAXONOMIA_AMBIGUA)', () => {
  const rows = [fila('DEPRECIACION_AMORTIZACION', 'us-gaap:Depreciation', 70), fila('DEPRECIACION_AMORTIZACION', 'us-gaap:DepreciationAndAmortization', 90)];
  assert.equal(normalizarPartidas(rows, 'SEC_EDGAR').valores.DEPRECIACION_AMORTIZACION, 90);
});
test('Estado principal EDINET prevalece sobre SummaryOfBusinessResults', () => {
  const rows = [fila('INGRESOS', 'jppfs_cor:NetSales', 100), fila('INGRESOS', 'jpcrp_cor:NetSalesSummaryOfBusinessResults', 130)];
  assert.equal(normalizarPartidas(rows, 'EDINET').valores.INGRESOS, 100);
});
test('Deuda CP JGAAP: suma de líneas disjuntas; arrendamientos fuera', () => {
  const rows = [fila('DEUDA_CORTO_PLAZO', 'jppfs_cor:ShortTermLoansPayable', 30), fila('DEUDA_CORTO_PLAZO', 'jppfs_cor:CurrentPortionOfLongTermLoansPayable', 20), fila('DEUDA_CORTO_PLAZO', 'jppfs_cor:LeaseObligationsCL', 5)];
  assert.equal(normalizarPartidas(rows, 'EDINET').valores.DEUDA_CORTO_PLAZO, 50);
});
test('US LongTermDebt (total) menos la parte corriente publicada', () => {
  const rows = [fila('DEUDA_LARGO_PLAZO', 'us-gaap:LongTermDebt', 500), fila('DEUDA_LARGO_PLAZO', 'us-gaap:SeniorNotes', 300), fila('DEUDA_CORTO_PLAZO', 'us-gaap:LongTermDebtCurrent', 50)];
  const v = normalizarPartidas(rows, 'SEC_EDGAR').valores;
  assert.equal(v.DEUDA_LARGO_PLAZO, 450);
  assert.equal(v.DEUDA_CORTO_PLAZO, 50);
});
test('Mapeos incompatibles se excluyen: pasivo total no es deuda; ingresos diferidos no son ingresos', () => {
  const v = normalizarPartidas([fila('DEUDA_LARGO_PLAZO', 'Liabilities', 999), fila('INGRESOS', 'jppfs_cor:UnearnedRevenue', 7)], 'FINMIND').valores;
  assert.equal(v.DEUDA_LARGO_PLAZO, undefined);
  assert.equal(v.INGRESOS, undefined);
});
test('Parte corriente mapeada como LP se reclasifica a deuda CP (no se pierde ni se duplica)', () => {
  const rows = [fila('DEUDA_CORTO_PLAZO', 'jppfs_cor:ShortTermLoansPayable', 30), fila('DEUDA_LARGO_PLAZO', 'jppfs_cor:CurrentPortionOfLongTermLoansPayable', 20),
    fila('DEUDA_LARGO_PLAZO', 'jppfs_cor:LongTermLoansPayable', 100), fila('DEUDA_LARGO_PLAZO', 'jppfs_cor:LeaseObligationsNCL', 9)];
  const v = normalizarPartidas(rows, 'EDINET').valores;
  assert.equal(v.DEUDA_CORTO_PLAZO, 50);
  assert.equal(v.DEUDA_LARGO_PLAZO, 100);
  // Si la misma línea ya está en CP no se suma dos veces.
  const dup = normalizarPartidas([fila('DEUDA_CORTO_PLAZO', 'jppfs_cor:CurrentPortionOfLongTermLoansPayable', 20), fila('DEUDA_LARGO_PLAZO', 'jppfs_cor:CurrentPortionOfLongTermLoansPayable', 20)], 'EDINET').valores;
  assert.equal(dup.DEUDA_CORTO_PLAZO, 20);
});
test('D&A: el agregado SEC DepreciationAmortizationAndAccretionNet se acepta; la acreción sola no', () => {
  const rows = [fila('DEPRECIACION_AMORTIZACION', 'us-gaap:Depreciation', 70), fila('DEPRECIACION_AMORTIZACION', 'us-gaap:DepreciationAmortizationAndAccretionNet', 95)];
  assert.equal(normalizarPartidas(rows, 'SEC_EDGAR').valores.DEPRECIACION_AMORTIZACION, 95);
  assert.equal(normalizarPartidas([fila('DEPRECIACION_AMORTIZACION', 'us-gaap:AccretionExpense', 5)], 'SEC_EDGAR').valores.DEPRECIACION_AMORTIZACION, undefined);
});
test('US: agregado total publicado sin desglose CP = deuda total (confianza MEDIA)', () => {
  const v = normalizarPartidas([fila('DEUDA_LARGO_PLAZO', 'us-gaap:NotesPayable', 7839), fila('EFECTIVO', 'CashAndCashEquivalentsAtCarryingValue', 5051)], 'SEC_EDGAR').valores;
  assert.equal(v.DEUDA_TOTAL, 7839);
  assert.equal(v.DEUDA_CORTO_PLAZO, undefined);
  const d = kpiCalcularInforme(1, { ...v, EBIT: 1000, DEPRECIACION_AMORTIZACION: 100 });
  assert.equal(d.find(k => k.kpi === 'DEUDA_TOTAL').nivelConfianza, 'MEDIA');
  assert.equal(d.find(k => k.kpi === 'DEUDA_NETA_SOBRE_EBITDA').valor, (7839 - 5051) / 1100);
  // Un agregado solo no corriente (LongTermDebtNoncurrent) sigue sin bastar: el CP es desconocido.
  assert.equal(normalizarPartidas([fila('DEUDA_LARGO_PLAZO', 'us-gaap:LongTermDebtNoncurrent', 500)], 'SEC_EDGAR').valores.DEUDA_TOTAL, undefined);
  // Fuera de SEC la regla no aplica.
  assert.equal(normalizarPartidas([fila('DEUDA_LARGO_PLAZO', 'NotesPayable', 500)], 'EDINET').valores.DEUDA_TOTAL, undefined);
});
test('US: LongTermDebt único en LP con LongTermDebtCurrent en CP no cuenta dos veces la parte corriente', () => {
  const v = normalizarPartidas([fila('DEUDA_LARGO_PLAZO', 'us-gaap:LongTermDebt', 1000), fila('DEUDA_CORTO_PLAZO', 'us-gaap:LongTermDebtCurrent', 100)], 'SEC_EDGAR').valores;
  assert.equal(v.DEUDA_LARGO_PLAZO, 900);
  assert.equal(v.DEUDA_TOTAL, 1000);
});
test('Fondo de maniobra = activo corriente - pasivo corriente; sin uno de los dos no se calcula', () => {
  assert.equal(kpi({ ACTIVOS_CORRIENTES: 500, PASIVOS_CORRIENTES: 320 }, 'FONDO_MANIOBRA').valor, 180);
  assert.equal(kpi({ ACTIVOS_CORRIENTES: 100, PASIVOS_CORRIENTES: 250 }, 'FONDO_MANIOBRA').valor, -150);
  assert.equal(kpi({ ACTIVOS_CORRIENTES: 500 }, 'FONDO_MANIOBRA'), undefined);
});
test('Combinación sin regla contrastada sigue bloqueando (no se elige al azar)', () => {
  const rows = [fila('BENEFICIO_BRUTO', 'x:GrossProfitA', 1), fila('BENEFICIO_BRUTO', 'x:GrossProfitB', 2)];
  assert.throws(() => normalizarPartidas(rows, 'SEC_EDGAR'), /importes incompatibles/);
  assert.equal(resolverPartidas(rows, 'SEC_EDGAR').rows.length, 2);
});
