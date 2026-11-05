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
test('Combinación sin regla contrastada sigue bloqueando (no se elige al azar)', () => {
  const rows = [fila('BENEFICIO_BRUTO', 'x:GrossProfitA', 1), fila('BENEFICIO_BRUTO', 'x:GrossProfitB', 2)];
  assert.throws(() => normalizarPartidas(rows, 'SEC_EDGAR'), /importes incompatibles/);
  assert.equal(resolverPartidas(rows, 'SEC_EDGAR').rows.length, 2);
});
