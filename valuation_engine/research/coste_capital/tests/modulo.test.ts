import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calcularFinancieros, calcularBursatiles, calcularCapitalizacion, calcularVolatilidadFcf, construirBenchmark,
  detectarDuplicidades, evaluarIndicador, fraccion, media, METODOLOGIAS, percentil, simularImpactoHipotetico } from '../src';
import type { BaseHipotetica, EfectoHipotetico, Incorporacion, Indicador } from '../src';
import { empresa, fecha, fuente, dato, periodo, financieros, buscar, bursatiles, sesiones, capitalizacion, comparar } from './ejemplos';
const near = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-12, `${a} != ${b}`);
const incorporated = (i: Indicador, componente: Incorporacion['componente'], cobertura: Incorporacion['cobertura'] = 'TOTAL'): Incorporacion => ({
  riesgo: 'RIESGO_HIPOTETICO', indicadores: [i.id], componente, cobertura, fuente, conocidoDesde: '2026-01-01',
  justificacion: 'SOLO PRUEBAS: conciliación hipotética del riesgo específico ya reflejado en el componente base.'
});
test('A. Grande, caja elevada, poco endeudada y líquida: identifica ventajas sin bonificación automática', () => {
  const f = financieros();
  assert.equal(buscar(f, 'DEUDA_NETA').valor, -900);
  const cash = buscar(f, 'CASH_RATIO'), ref = comparar(cash, 1);
  assert.equal(ref.propuesta.direccion, 'FAVORABLE');
  assert.equal(ref.propuesta.estado, 'NO_ESTIMABLE'); assert.equal(ref.propuesta.ajustePropuesto, null);
  const reconciled = evaluarIndicador(cash, ref.benchmark, [incorporated(cash, 'KD')]);
  assert.equal(reconciled.estado, 'YA_INCORPORADO'); assert.equal(reconciled.ajustePropuesto, 0);
  const size = comparar(capitalizacion(1e9), 1e8).propuesta;
  assert.ok(size.diferencia! > 0); assert.equal(size.direccion, 'DESCONOCIDO'); assert.equal(size.ajustePropuesto, null);
  const volume = comparar(buscar(bursatiles(100000), 'VOLUMEN_MONETARIO'), 10000).propuesta;
  assert.equal(volume.direccion, 'FAVORABLE'); assert.equal(volume.estado, 'NO_ESTIMABLE');
});
test('B. Pequeña, ilíquida y débil: diagnóstico desfavorable y aviso de duplicidad sin coeficientes', () => {
  const cash = comparar(buscar(financieros({ efectivo: 1, deudaFinancieraLP: 10000 }), 'CASH_RATIO'), 1).propuesta;
  const liquidity = comparar(buscar(bursatiles(10), 'VOLUMEN_MONETARIO'), 10000).propuesta;
  const size = comparar(capitalizacion(1000), 1e8).propuesta;
  assert.equal(cash.direccion, 'DESFAVORABLE'); assert.equal(liquidity.direccion, 'DESFAVORABLE');
  assert.ok(detectarDuplicidades([cash, liquidity, size]).some(x => x.startsWith('TAMANO_LIQUIDEZ')));
  assert.ok([cash, liquidity, size].every(p => p.estado === 'NO_ESTIMABLE' && p.ajustePropuesto === null));
});
test('C. Gran tamaño e iliquidez bursátil coexisten sin compensación', () => {
  const size = comparar(capitalizacion(1e9), 1e8).propuesta;
  const liquid = comparar(buscar(bursatiles(10), 'VOLUMEN_MONETARIO'), 10000).propuesta;
  assert.ok(size.diferencia! > 0); assert.equal(liquid.direccion, 'DESFAVORABLE');
  assert.equal(size.ajustePropuesto, null); assert.equal(liquid.ajustePropuesto, null);
});
test('D. Pequeña con finanzas sólidas: no se penaliza tamaño', () => {
  const size = comparar(capitalizacion(1000), 1e8).propuesta;
  const cash = comparar(buscar(financieros(), 'CASH_RATIO'), 1).propuesta;
  assert.ok(size.diferencia! < 0); assert.equal(size.direccion, 'DESCONOCIDO'); assert.equal(size.estado, 'NO_ESTIMABLE');
  assert.equal(cash.direccion, 'FAVORABLE'); assert.equal(cash.ajustePropuesto, null);
});
test('E. Información insuficiente: null y NO_ESTIMABLE, sin fabricar cero', () => {
  const metrics = calcularFinancieros(empresa, fecha, 'USD', { inicio: '2025-01-01', fin: '2025-12-31', datos: {} });
  for (const i of metrics) { const p = evaluarIndicador(i, null); assert.equal(i.valor, null); assert.equal(p.estado, 'NO_ESTIMABLE'); assert.equal(p.ajustePropuesto, null); }
  const s = sesiones(10).map(({ volumenAcciones, volumenMonetario, retornoAjustado, bid, ask, accionesFreeFloat, freeFloatFraccion, ...rest }) => rest);
  const qs = calcularBursatiles(empresa, fecha, 'USD', s.map(s => s.fecha), s);
  assert.ok(qs.every(i => i.valor === null));
});
test('F. Incorporación en Ke/Kd/valor y cobertura parcial', () => {
  const i = buscar(bursatiles(10), 'VOLUMEN_MONETARIO'), b = comparar(i, 10000).benchmark;
  for (const component of ['KE', 'KD', 'EQUITY_VALUE'] as const) {
    const p = evaluarIndicador(i, b, [incorporated(i, component)]);
    assert.equal(p.estado, 'YA_INCORPORADO'); assert.equal(p.ajustePropuesto, 0); assert.equal(p.direccion, 'DESFAVORABLE');
  }
  assert.equal(evaluarIndicador(i, b, [incorporated(i, 'KE', 'PARCIAL')]).estado, 'NO_ESTIMABLE');
  const future = { ...incorporated(i, 'KE'), conocidoDesde: '2027-01-01' };
  assert.equal(evaluarIndicador(i, b, [future]).estado, 'NO_ESTIMABLE');
});
const base = (): BaseHipotetica => ({ uso: 'PRUEBA_HIPOTETICA', familia: 'FCFF', ke: { valor: .10, unidad: 'FRACCION_ANUAL' },
  kd: { valor: .05, unidad: 'FRACCION_ANUAL' }, pesoPatrimonio: .8, pesoDeuda: .2, tasaImpositiva: .25 });
const effect = (componente: 'KE' | 'KD', valor: number): EfectoHipotetico => ({ id: componente, componente,
  riesgo: `HIPOTETICO_${componente}`, evidenciaNoDuplicidad: 'Solo prueba aritmética: exposición separada hipotética.', variacion: { valor, unidad: 'PUNTOS_BASICOS' } });
test('G. Ke +100 pb se pondera por patrimonio; Kd +100 pb por deuda y escudo fiscal', () => {
  const b = base(); near(simularImpactoHipotetico(b, []).waccOriginal, .0875);
  near(simularImpactoHipotetico(b, [effect('KE', 100)]).deltaWacc, .008);
  near(simularImpactoHipotetico(b, [effect('KD', 100)]).deltaWacc, .0015);
  const both = simularImpactoHipotetico(b, [effect('KE', 100), effect('KD', 100)]);
  near(both.deltaWacc, .0095); assert.ok(both.waccHipotetico > both.waccOriginal); assert.equal(both.aplicableProduccion, false);
});
test('G. Reducciones justificadas en referencia hipotética, positivas, cero y unidades', () => {
  for (const c of ['KE', 'KD'] as const) {
    const e = effect(c, -50);
    assert.throws(() => simularImpactoHipotetico(base(), [e]), /Reducción/);
    e.referencia = { riesgo: e.riesgo, componente: c, primaIncluida: { valor: 100, unidad: 'PUNTOS_BASICOS' }, justificacion: 'PRUEBA: prima existente conciliada' };
    const r = simularImpactoHipotetico(base(), [e]); assert.equal(r.detalle[0].estado, 'NEGATIVO');
    near(r.deltaWacc, c === 'KE' ? -.004 : -.00075); assert.ok(r.waccHipotetico < r.waccOriginal);
    e.referencia.primaIncluida.valor = 10; assert.throws(() => simularImpactoHipotetico(base(), [e]), /Reducción/);
  }
  near(simularImpactoHipotetico(base(), [effect('KE', 0)]).deltaWacc, 0);
  assert.equal(simularImpactoHipotetico(base(), [effect('KE', 0)]).detalle[0].estado, 'CERO');
  near(fraccion({ valor: 100, unidad: 'PUNTOS_BASICOS' }), .01);
  near(fraccion({ valor: .01, unidad: 'FRACCION_ANUAL' }), .01);
  assert.throws(() => fraccion({ valor: 1, unidad: 'PORCENTAJE' } as any), /Unidad/);
});
test('G. No duplicar riesgos ni aceptar reducción de otro riesgo/componente', () => {
  const e = effect('KE', -10); e.referencia = { riesgo: e.riesgo, componente: 'KD', primaIncluida: { valor: 20, unidad: 'PUNTOS_BASICOS' }, justificacion: 'PRUEBA' };
  assert.throws(() => simularImpactoHipotetico(base(), [e]), /Reducción/);
  assert.throws(() => simularImpactoHipotetico(base(), [effect('KE', 10), effect('KE', 10)]), /duplicado/);
  assert.throws(() => simularImpactoHipotetico({ ...base(), pesoDeuda: .4 }, []), /Pesos/);
  const b = base(); b.tasaImpositiva = 1; near(simularImpactoHipotetico(b, [effect('KD', 100)]).deltaWacc, 0);
});
test('H. API interna desactivada y registro sin calibraciones numéricas', () => {
  assert.ok(METODOLOGIAS.every(m => m.cuantificacionAutorizada === false));
  assert.equal(comparar(capitalizacion(1e9), 1e8).propuesta.aplicableProduccion, false);
  assert.throws(() => simularImpactoHipotetico({ ...base(), uso: 'PRODUCCION' } as any, []), /Solo simulación/);
});
test('Igualdad exacta es NEUTRAL y CERO incremental, tamaño no determina signo', () => {
  const p = comparar(buscar(financieros(), 'CASH_RATIO'), 5).propuesta;
  assert.equal(p.direccion, 'NEUTRAL'); assert.equal(p.estado, 'CERO'); assert.equal(p.ajustePropuesto, 0);
});
test('Ratios: fórmulas, deuda financiera, denominadores y signos', () => {
  const f = financieros(); near(buscar(f, 'CURRENT_RATIO').valor!, 10); near(buscar(f, 'QUICK_RATIO').valor!, 8);
  near(buscar(f, 'CASH_RATIO').valor!, 5); near(buscar(f, 'COBERTURA_INTERESES').valor!, 50);
  near(buscar(f, 'DEUDA_NETA_EBITDA').valor!, -1.5); near(buscar(f, 'FCF_DEUDA').valor!, 6);
  assert.equal(buscar(financieros({ interesesGastoPositivo: 0 }), 'COBERTURA_INTERESES').valor, null);
  assert.equal(buscar(financieros({ ebitda: -10 }), 'DEUDA_NETA_EBITDA').valor, null);
  assert.equal(buscar(financieros({ deudaFinancieraCP: 0, deudaFinancieraLP: 0 }), 'FCF_DEUDA').valor, null);
  assert.equal(buscar(financieros({ inventarios: null }), 'QUICK_RATIO').valor, null);
  assert.equal(buscar(financieros({ capexSalidaPositiva: -10 }), 'FCF').valor, null);
  assert.equal(buscar(financieros({ efectivo: 0 }), 'EFECTIVO').valor, 0);
});
test('Dato futuro, unidad equivocada, moneda mezclada, NaN y falta de validación no producen ratio', () => {
  for (const change of [{ conocidoDesde: '2027-01-01' }, { moneda: 'JPY' }, { unidad: 'VECES' }, { valor: NaN }, { validado: false }]) {
    const p = periodo(); Object.assign(p.datos.efectivo!, change);
    assert.equal(buscar(calcularFinancieros(empresa, fecha, 'USD', p), 'CASH_RATIO').valor, null);
  }
  assert.throws(() => calcularFinancieros(empresa, '2026-02-30', 'USD', periodo()), /Fechas/);
});
test('Mercado: Amihud real de la muestra, spread cotizado y turnover', () => {
  const f = bursatiles(100); near(buscar(f, 'AMIHUD').valor!, .01 / 1000);
  near(buscar(f, 'SPREAD_COTIZADO').valor!, .002); near(buscar(f, 'TURNOVER_FREE_FLOAT').valor!, .0001);
  near(buscar(f, 'CV_VOLUMEN').valor!, 0); near(buscar(f, 'DIAS_SIN_NEGOCIACION').valor!, 0);
});
test('Mercado: volumen monetario ausente no se reconstruye de precios/acciones', () => {
  const s = sesiones(100); s.forEach(x => { delete x.volumenMonetario; });
  const f = calcularBursatiles(empresa, fecha, 'USD', s.map(x => x.fecha), s);
  assert.equal(buscar(f, 'AMIHUD').valor, null); assert.equal(buscar(f, 'VOLUMEN_MONETARIO').valor, null);
  assert.equal(buscar(f, 'VOLUMEN_ACCIONES').valor, 100);
});
test('Mercado: días sin negociación confirmados y Amihud solo sesiones con importe positivo', () => {
  const s = sesiones(100); s[0].volumenAcciones = 0; s[0].volumenMonetario = 0; delete s[0].retornoAjustado;
  const f = calcularBursatiles(empresa, fecha, 'USD', s.map(x => x.fecha), s);
  assert.equal(buscar(f, 'DIAS_SIN_NEGOCIACION').valor, 1); assert.equal(buscar(f, 'AMIHUD').observaciones, 1);
  s[1].volumenMonetario = 0;
  assert.equal(buscar(calcularBursatiles(empresa, fecha, 'USD', s.map(x => x.fecha), s), 'AMIHUD').valor, null);
});
test('Mercado: calendarios incompletos, duplicados y spread sin simultaneidad', () => {
  const s = sesiones(100), dates = s.map(x => x.fecha);
  assert.ok(calcularBursatiles(empresa, fecha, 'USD', dates, s.slice(1)).every(i => i.valor === null));
  assert.ok(calcularBursatiles(empresa, fecha, 'USD', dates, [s[0], s[0]]).every(i => i.valor === null));
  assert.throws(() => calcularBursatiles(empresa, fecha, 'USD', [dates[0], dates[0]], s), /Calendario/);
  s[0].cotizacionSimultanea = false;
  assert.equal(buscar(calcularBursatiles(empresa, fecha, 'USD', dates, s), 'SPREAD_COTIZADO').valor, null);
});
test('Capitalización: precio × acciones, fecha/clase/dilución/splits explícitos', () => {
  assert.equal(capitalizacion(1000).valor, 10000);
  const price = dato(10, 'MONEDA_POR_ACCION'), shares = dato(1000, 'ACCIONES');
  const controls = { mismaClase: true, splitsConciliados: true, baseAcciones: 'EN_CIRCULACION' as const };
  assert.equal(calcularCapitalizacion(empresa, fecha, 'USD', price, shares, { ...controls, mismaClase: false }).valor, null);
  assert.equal(calcularCapitalizacion(empresa, fecha, 'USD', price, shares, { ...controls, baseAcciones: 'DILUIDAS' }).valor, null);
  shares.fecha = '2025-12-30';
  assert.equal(calcularCapitalizacion(empresa, fecha, 'USD', price, shares, controls).valor, null);
});
test('Volatilidad FCF: muestra completa, años bisiestos y rechazo de huecos/solapamiento', () => {
  const a = periodo(), b = periodo({ cfo: 900 }); b.inicio = '2024-01-01'; b.fin = '2024-12-31';
  Object.values(b.datos).forEach(d => { d!.fecha = b.fin; d!.conocidoDesde = b.fin; });
  near(calcularVolatilidadFcf(empresa, fecha, 'USD', [a, b]).valor!, Math.sqrt(20000));
  assert.equal(calcularVolatilidadFcf(empresa, fecha, 'USD', [a, a]).valor, null);
  b.datos.cfo!.valor = null; assert.equal(calcularVolatilidadFcf(empresa, fecha, 'USD', [a, b]).valor, null);
});
test('Bancos/seguros: ratios industriales NO_APLICABLE; WACC FCFF no se fuerza en modelos equity', () => {
  for (const familia of ['BANK', 'INSURANCE'] as const) {
    const i = buscar(calcularFinancieros({ ...empresa, familia }, fecha, 'USD', periodo()), 'DEUDA_NETA_EBITDA');
    const p = evaluarIndicador(i, null); assert.equal(p.estado, 'NO_APLICABLE'); assert.equal(p.ajustePropuesto, null);
    assert.throws(() => simularImpactoHipotetico({ ...base(), familia }, []), /familias equity/);
  }
  assert.throws(() => simularImpactoHipotetico({ ...base(), familia: 'REIT' }, []), /familias equity/);
});
test('Comparables: mediana/percentiles/dispersion y sin sesgo de información futura', () => {
  const i = buscar(financieros(), 'CASH_RATIO'), { benchmark: b } = comparar(i, 1);
  const future = { ...b.miembros[0], empresa: { ...empresa, id: 'FUTURO' }, conocidoDesde: '2027-01-01', valor: 1e9 };
  const fx = { ...b.miembros[0], empresa: { ...empresa, id: 'OTRA_MONEDA' }, moneda: 'JPY' };
  const self = { ...i };
  const result = construirBenchmark(empresa, b.reglas, [...b.miembros, future, fx, self]);
  assert.equal(result.estadisticas!.n, 2); assert.equal(result.estadisticas!.mediana, 1); assert.equal(result.exclusiones.length, 3);
  near(percentil([1, 2, 3, 4], .25)!, 1.75); assert.equal(percentil([], .5), null);
  assert.equal(evaluarIndicador(i, result).posicionPercentil, 100);
});
test('Comparables: duplicados, mezcla de periodos, controles de tamaño y ausencia de referencia', () => {
  const i = buscar(financieros(), 'CASH_RATIO'), b = comparar(i, 1).benchmark;
  const duplicate = construirBenchmark(empresa, b.reglas, [b.miembros[0], b.miembros[0]]);
  assert.equal(duplicate.estadisticas, null); assert.equal(evaluarIndicador(i, duplicate).estado, 'NO_ESTIMABLE');
  assert.throws(() => construirBenchmark(empresa, { ...b.reglas, variablesControl: [b.reglas.variableEstudiada] }, b.miembros), /Reglas/);
  assert.equal(evaluarIndicador(i, { ...b, empresaObjetivo: 'OTRA' }).referencia, null);
  assert.equal(evaluarIndicador(i, null).ajustePropuesto, null);
});
test('Funciones puras: no mutan observaciones, comparables ni bases hipotéticas', () => {
  const p = periodo(), s = sesiones(100), i = buscar(financieros(), 'CASH_RATIO'), b = comparar(i, 1).benchmark, w = base();
  const original = JSON.stringify({ p, s, b, w });
  calcularFinancieros(empresa, fecha, 'USD', p); calcularBursatiles(empresa, fecha, 'USD', s.map(x => x.fecha), s);
  evaluarIndicador(i, b); simularImpactoHipotetico(w, [effect('KE', 100)]);
  assert.equal(JSON.stringify({ p, s, b, w }), original);
});
test('Comparables bursátiles: exigen mercado y sesiones comunes, conservan exclusiones y recalculan mediana', () => {
  const i = buscar(bursatiles(100), 'AMIHUD'), b = comparar(i, .001).benchmark;
  const other = { ...b.miembros[0], empresa: { ...empresa, id: 'OTRA_BOLSA', mercado: 'OTRA_BOLSA' } };
  const missing = { ...b.miembros[0], empresa: { ...empresa, id: 'OTRO_CALENDARIO' }, calendarioSesiones: ['2026-01-12'] };
  const checked = construirBenchmark(empresa, b.reglas, [...b.miembros, other, missing]);
  assert.equal(checked.exclusiones.length, 2);
  const tampered = { ...checked, estadisticas: { ...checked.estadisticas!, mediana: 999 } };
  const p = evaluarIndicador(i, tampered);
  assert.equal(p.referencia, .001); assert.equal(p.benchmark!.exclusiones.length, 2);
  assert.throws(() => construirBenchmark(empresa, { ...b.reglas, sesionesEsperadas: undefined }, b.miembros), /calendario/);
});
test('Mercado: datos de negociación contradictorios y fechas futuras no generan indicadores', () => {
  const s = sesiones(100), dates = s.map(x => x.fecha); s[0].volumenMonetario = 0;
  assert.ok(calcularBursatiles(empresa, fecha, 'USD', dates, s).every(i => i.valor === null));
  s[0].volumenMonetario = 1000; s[0].conocidoDesde = '2027-01-01';
  assert.ok(calcularBursatiles(empresa, fecha, 'USD', dates, s).every(i => i.valor === null));
});
test('Estadística sin observaciones no se interpreta como media cero', () => {
  assert.throws(() => media([]), /ausencia no equivale a cero/);
  assert.throws(() => media([1, NaN]), /observaciones finitas/);
  near(media([0, 0]), 0);
});
