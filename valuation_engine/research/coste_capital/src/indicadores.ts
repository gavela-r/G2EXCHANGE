import type { Dato, DefinicionIndicador, Empresa, Fuente, IdIndicador, Indicador, PeriodoFinanciero, Sesion, Unidad, CampoFinanciero } from './tipos';

const industrial = ['BANK', 'INSURANCE'] as const;
function def(factor: DefinicionIndicador['factor'], unidad: Unidad, relacion: DefinicionIndicador['relacion'], componentes: DefinicionIndicador['componentes'], financiero = false): DefinicionIndicador {
  return { factor, unidad, relacion, componentes, noAplicableA: financiero ? [...industrial] : [] };
}
export const DEFINICIONES: Readonly<Record<IdIndicador, DefinicionIndicador>> = {
  EFECTIVO: def('LIQUIDEZ_FINANCIERA', 'MONEDA', 'SIN_RELACION_MONOTONA', ['EQUITY_VALUE', 'ESTRUCTURA'], true),
  DEUDA_BRUTA: def('INSOLVENCIA_REFINANCIACION', 'MONEDA', 'SIN_RELACION_MONOTONA', ['KD', 'ESTRUCTURA'], true),
  DEUDA_NETA: def('LIQUIDEZ_FINANCIERA', 'MONEDA', 'SIN_RELACION_MONOTONA', ['EQUITY_VALUE', 'KD'], true),
  CURRENT_RATIO: def('LIQUIDEZ_FINANCIERA', 'VECES', 'MAYOR_FAVORABLE', ['KD', 'FCFF'], true),
  QUICK_RATIO: def('LIQUIDEZ_FINANCIERA', 'VECES', 'MAYOR_FAVORABLE', ['KD', 'FCFF'], true),
  CASH_RATIO: def('LIQUIDEZ_FINANCIERA', 'VECES', 'MAYOR_FAVORABLE', ['KD', 'EQUITY_VALUE'], true),
  COBERTURA_INTERESES: def('INSOLVENCIA_REFINANCIACION', 'VECES', 'MAYOR_FAVORABLE', ['KD'], true),
  DEUDA_NETA_EBITDA: def('INSOLVENCIA_REFINANCIACION', 'VECES', 'MENOR_FAVORABLE', ['KD', 'KE'], true),
  CFO: def('LIQUIDEZ_FINANCIERA', 'MONEDA', 'SIN_RELACION_MONOTONA', ['FCFF'], true),
  FCF: def('LIQUIDEZ_FINANCIERA', 'MONEDA', 'SIN_RELACION_MONOTONA', ['FCFF'], true),
  FCF_DEUDA: def('INSOLVENCIA_REFINANCIACION', 'VECES', 'MAYOR_FAVORABLE', ['KD', 'FCFF'], true),
  VOLATILIDAD_FCF: def('LIQUIDEZ_FINANCIERA', 'MONEDA', 'SIN_RELACION_MONOTONA', ['FCFF', 'ESCENARIOS'], true),
  NECESIDAD_FINANCIACION: def('INSOLVENCIA_REFINANCIACION', 'MONEDA', 'SIN_RELACION_MONOTONA', ['ESCENARIOS', 'KD'], true),
  VENCIMIENTOS: def('INSOLVENCIA_REFINANCIACION', 'MONEDA', 'SIN_RELACION_MONOTONA', ['KD', 'ESCENARIOS'], true),
  CAPITALIZACION: def('TAMANO', 'MONEDA', 'SIN_RELACION_MONOTONA', ['KE', 'KD', 'ESTRUCTURA']),
  INGRESOS: def('TAMANO', 'MONEDA', 'SIN_RELACION_MONOTONA', ['KE']),
  EBITDA: def('TAMANO', 'MONEDA', 'SIN_RELACION_MONOTONA', ['KE', 'KD'], true),
  ACTIVOS_TOTALES: def('TAMANO', 'MONEDA', 'SIN_RELACION_MONOTONA', ['KE']),
  ACTIVOS_OPERATIVOS: def('TAMANO', 'MONEDA', 'SIN_RELACION_MONOTONA', ['FCFF'], true),
  POSICION_COMPETITIVA: def('TAMANO', 'FRACCION', 'SIN_RELACION_MONOTONA', ['FCFF', 'ESCENARIOS']),
  ESTABILIDAD_OPERATIVA: def('TAMANO', 'VECES', 'SIN_RELACION_MONOTONA', ['FCFF', 'ESCENARIOS']),
  DIVERSIFICACION_GEOGRAFICA: def('TAMANO', 'FRACCION', 'SIN_RELACION_MONOTONA', ['FCFF', 'KE']),
  ACCESO_FINANCIACION: def('INSOLVENCIA_REFINANCIACION', 'MONEDA', 'SIN_RELACION_MONOTONA', ['KD', 'ESCENARIOS']),
  VOLUMEN_ACCIONES: def('LIQUIDEZ_BURSATIL', 'ACCIONES', 'MAYOR_FAVORABLE', ['KE']),
  VOLUMEN_MONETARIO: def('LIQUIDEZ_BURSATIL', 'MONEDA', 'MAYOR_FAVORABLE', ['KE']),
  TURNOVER_FREE_FLOAT: def('LIQUIDEZ_BURSATIL', 'FRACCION', 'MAYOR_FAVORABLE', ['KE']),
  FREE_FLOAT: def('LIQUIDEZ_BURSATIL', 'FRACCION', 'MAYOR_FAVORABLE', ['KE']),
  SPREAD_COTIZADO: def('LIQUIDEZ_BURSATIL', 'FRACCION', 'MENOR_FAVORABLE', ['KE', 'EQUITY_VALUE']),
  AMIHUD: def('LIQUIDEZ_BURSATIL', 'INV_MONEDA', 'MENOR_FAVORABLE', ['KE']),
  DIAS_SIN_NEGOCIACION: def('LIQUIDEZ_BURSATIL', 'DIAS', 'MENOR_FAVORABLE', ['KE']),
  CV_VOLUMEN: def('LIQUIDEZ_BURSATIL', 'VECES', 'MENOR_FAVORABLE', ['KE']),
  DESCUENTO_COMERCIABILIDAD: def('COMERCIABILIDAD', 'FRACCION', 'SIN_RELACION_MONOTONA', ['EQUITY_VALUE'])
};
export function fechaValida(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(Date.parse(s)) && new Date(s).toISOString().slice(0, 10) === s;
}
export function dias(inicio: string, fin: string): number { return (Date.parse(fin) - Date.parse(inicio)) / 86400000 + 1; }
export function media(xs: number[]): number {
  if (!xs.length || xs.some(x => !Number.isFinite(x))) throw new Error('Media requiere observaciones finitas; ausencia no equivale a cero');
  return xs.reduce((a, b) => a + b / xs.length, 0);
}
export function desviacionMuestral(xs: number[]): number | null {
  if (xs.length < 2) return null;
  const m = media(xs);
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1));
}
export function fuenteValida(f: Fuente): boolean { return !!f?.identificador?.trim() && /^https?:\/\//.test(f?.url ?? ''); }
export function indicadorVacio(empresa: Empresa, fecha: string, id: IdIndicador, inicio: string, fin: string, moneda?: string): Indicador {
  if (!fechaValida(fecha) || !fechaValida(inicio) || !fechaValida(fin) || inicio > fin) throw new Error('Fechas civiles/periodo inválidos');
  return { empresa: { ...empresa }, fechaValoracion: fecha, id, factor: DEFINICIONES[id].factor, valor: null,
    unidad: DEFINICIONES[id].unidad, moneda: ['MONEDA', 'INV_MONEDA'].includes(DEFINICIONES[id].unidad) ? moneda : undefined,
    periodoInicio: inicio, periodoFin: fin, conocidoDesde: null, fuentes: [], formula: '', observaciones: 0, limitaciones: [] };
}
function datoDisponible(d: Dato | undefined, unidad: Unidad, moneda: string | undefined, fecha: string, fin: string): d is Dato & { valor: number } {
  return !!d && d.validado === true && typeof d.valor === 'number' && Number.isFinite(d.valor)
    && d.unidad === unidad && (unidad !== 'MONEDA' && unidad !== 'MONEDA_POR_ACCION' || (!!moneda && d.moneda === moneda))
    && fechaValida(d.fecha) && d.fecha === fin && fechaValida(d.conocidoDesde) && d.conocidoDesde >= d.fecha && d.conocidoDesde <= fecha && d.fecha <= fecha && fuenteValida(d.fuente);
}
export function calcularFinancieros(empresa: Empresa, fecha: string, moneda: string, p: PeriodoFinanciero): Indicador[] {
  if (!/^[A-Z]{3}$/.test(moneda)) throw new Error('Moneda ISO requerida; importes en unidades');
  const results: Indicador[] = [];
  const calc = (id: IdIndicador, deps: CampoFinanciero[], formula: string, fn: (...xs: number[]) => number | null) => {
    const r = indicadorVacio(empresa, fecha, id, p.inicio, p.fin, moneda); r.formula = formula;
    const inputs = deps.map(k => p.datos[k]);
    if (inputs.every(d => datoDisponible(d, 'MONEDA', moneda, fecha, p.fin))) {
      const ds = inputs as (Dato & { valor: number })[];
      const value = fn(...ds.map(d => d.valor));
      if (value !== null && Number.isFinite(value)) {
        r.valor = value; r.observaciones = 1; r.fuentes = ds.map(d => ({ ...d.fuente }));
        r.conocidoDesde = ds.map(d => d.conocidoDesde).sort().at(-1)!;
      } else r.limitaciones.push('Signos o denominador incompatibles con la definición; no se convierte a cero.');
    } else r.limitaciones.push(`Faltan datos validados, fechados y en la misma moneda/unidad: ${deps.join(', ')}.`);
    if (DEFINICIONES[id].noAplicableA.includes(empresa.familia)) {
      r.valor = null; r.limitaciones.push('Definición industrial no aplicable a bancos/aseguradoras.');
    }
    results.push(r);
  };
  const nonnegative = (x: number) => x >= 0 ? x : null;
  calc('EFECTIVO', ['efectivo'], 'Efectivo y equivalentes declarados', nonnegative);
  calc('DEUDA_BRUTA', ['deudaFinancieraCP', 'deudaFinancieraLP'], 'Deuda financiera CP + LP', (a, b) => a >= 0 && b >= 0 ? a + b : null);
  calc('DEUDA_NETA', ['deudaFinancieraCP', 'deudaFinancieraLP', 'efectivo'], 'Deuda financiera CP + LP − efectivo', (a, b, c) => Math.min(a, b, c) >= 0 ? a + b - c : null);
  calc('CURRENT_RATIO', ['activosCorrientes', 'pasivosCorrientes'], 'Activo corriente / pasivo corriente', (a, b) => a >= 0 && b > 0 ? a / b : null);
  calc('QUICK_RATIO', ['activosCorrientes', 'inventarios', 'prepagos', 'pasivosCorrientes'], '(AC − inventarios − prepagos) / PC', (a, b, c, d) => Math.min(a, b, c) >= 0 && a >= b + c && d > 0 ? (a - b - c) / d : null);
  calc('CASH_RATIO', ['efectivo', 'pasivosCorrientes'], 'Efectivo y equivalentes / PC', (a, b) => a >= 0 && b > 0 ? a / b : null);
  calc('COBERTURA_INTERESES', ['ebit', 'interesesGastoPositivo'], 'EBIT / gasto de intereses positivo', (a, b) => b > 0 ? a / b : null);
  calc('DEUDA_NETA_EBITDA', ['deudaFinancieraCP', 'deudaFinancieraLP', 'efectivo', 'ebitda'], '(Deuda CP + LP − efectivo) / EBITDA', (a, b, c, d) => Math.min(a, b, c) >= 0 && d > 0 ? (a + b - c) / d : null);
  calc('CFO', ['cfo'], 'CFO reportado', x => x);
  calc('FCF', ['cfo', 'capexSalidaPositiva'], 'CFO − CAPEX (no equivale automáticamente a FCFF)', (a, b) => b >= 0 ? a - b : null);
  calc('FCF_DEUDA', ['cfo', 'capexSalidaPositiva', 'deudaFinancieraCP', 'deudaFinancieraLP'], '(CFO − CAPEX) / deuda financiera bruta', (a, b, c, d) => Math.min(b, c, d) >= 0 && c + d > 0 ? (a - b) / (c + d) : null);
  for (const [id, campo] of [['INGRESOS', 'ingresos'], ['EBITDA', 'ebitda'], ['ACTIVOS_TOTALES', 'activosTotales'], ['ACTIVOS_OPERATIVOS', 'activosOperativos']] as const) {
    calc(id, [campo], 'Importe reportado validado', x => id === 'EBITDA' ? x : nonnegative(x));
  }
  for (const id of ['NECESIDAD_FINANCIACION', 'VENCIMIENTOS', 'POSICION_COMPETITIVA', 'ESTABILIDAD_OPERATIVA', 'DIVERSIFICACION_GEOGRAFICA', 'ACCESO_FINANCIACION'] as const) {
    const r = indicadorVacio(empresa, fecha, id, p.inicio, p.fin, moneda);
    r.limitaciones.push('Sin calendario contractual, previsión validada o definición operativa comparable; no inferir de saldos agregados.'); results.push(r);
  }
  return results;
}
export function calcularVolatilidadFcf(empresa: Empresa, fecha: string, moneda: string, periodos: PeriodoFinanciero[]): Indicador {
  const sorted = [...periodos].sort((a, b) => a.fin.localeCompare(b.fin));
  const inicio = sorted[0]?.inicio ?? fecha, fin = sorted.at(-1)?.fin ?? fecha;
  const r = indicadorVacio(empresa, fecha, 'VOLATILIDAD_FCF', inicio, fin, moneda);
  r.formula = 'Desviación estándar muestral de CFO−CAPEX, en moneda nominal';
  const metrics = sorted.map(p => calcularFinancieros(empresa, fecha, moneda, p).find(m => m.id === 'FCF')!);
  const anual = sorted.every(p => p.inicio.slice(5) === '01-01' && p.fin.slice(5) === '12-31' && p.inicio.slice(0, 4) === p.fin.slice(0, 4));
  const valid = sorted.every((p, n) => n === 0 || p.inicio > sorted[n - 1].fin)
    && (anual || new Set(sorted.map(p => dias(p.inicio, p.fin))).size === 1);
  if (!valid || metrics.length < 2 || metrics.some(m => m.valor === null)) {
    r.limitaciones.push('Se requieren al menos dos periodos no solapados, de igual duración o años naturales completos, y todos los FCF válidos.'); return r;
  }
  r.valor = desviacionMuestral(metrics.map(m => m.valor!)); r.observaciones = metrics.length;
  r.fuentes = metrics.flatMap(m => m.fuentes); r.conocidoDesde = metrics.map(m => m.conocidoDesde!).sort().at(-1)!;
  r.limitaciones.push('Importe nominal sensible a escala/tendencia; no anualizado ni convertido en prima. Pocos ejercicios no acreditan estabilidad.');
  return r;
}
export function calcularCapitalizacion(empresa: Empresa, fecha: string, moneda: string, precio: Dato, acciones: Dato,
  controles: { mismaClase: boolean; splitsConciliados: boolean; baseAcciones: 'EN_CIRCULACION' | 'DILUIDAS' }): Indicador {
  if (!/^[A-Z]{3}$/.test(moneda)) throw new Error('Moneda ISO requerida');
  const r = indicadorVacio(empresa, fecha, 'CAPITALIZACION', precio.fecha, precio.fecha, moneda);
  r.formula = 'Precio × acciones en circulación de la misma clase y fecha (unidades)';
  if (!datoDisponible(precio, 'MONEDA_POR_ACCION', moneda, fecha, precio.fecha)
    || !datoDisponible(acciones, 'ACCIONES', undefined, fecha, precio.fecha)
    || precio.valor <= 0 || acciones.valor <= 0 || !controles.mismaClase || !controles.splitsConciliados || controles.baseAcciones !== 'EN_CIRCULACION') {
    r.limitaciones.push('Falta conciliación de fecha, clase, moneda, acciones en circulación o splits. Acciones diluidas no sustituyen capitalización observada.'); return r;
  }
  const value = precio.valor * acciones.valor;
  if (!Number.isFinite(value)) { r.limitaciones.push('Capitalización fuera del rango numérico.'); return r; }
  r.valor = value; r.observaciones = 1; r.fuentes = [{ ...precio.fuente }, { ...acciones.fuente }];
  r.conocidoDesde = [precio.conocidoDesde, acciones.conocidoDesde].sort().at(-1)!;
  r.limitaciones.push('Una clase; consolidar otras clases y evitar duplicar ADR antes de usar como capitalización total. Tamaño sin relación monotónica automática con riesgo.');
  return r;
}
export function calcularBursatiles(empresa: Empresa, fecha: string, moneda: string, calendario: string[], sesiones: Sesion[]): Indicador[] {
  if (!fechaValida(fecha) || !/^[A-Z]{3}$/.test(moneda)) throw new Error('Fecha de valoración o moneda inválida');
  const dates = [...calendario].sort();
  if (dates.some(d => !fechaValida(d) || d > fecha) || new Set(dates).size !== dates.length) throw new Error('Calendario inválido/duplicado/futuro');
  const rows = [...sesiones].sort((a, b) => a.fecha.localeCompare(b.fecha));
  const complete = dates.length > 0 && rows.length === dates.length && rows.every((s, n) => s.fecha === dates[n] && s.validado === true
    && fechaValida(s.conocidoDesde) && s.conocidoDesde >= s.fecha && s.conocidoDesde <= fecha && fuenteValida(s.fuente)
    && !(typeof s.volumenAcciones === 'number' && typeof s.volumenMonetario === 'number'
      && (s.volumenAcciones === 0) !== (s.volumenMonetario === 0)));
  const result: Indicador[] = [];
  const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);
  const calc = (id: IdIndicador, formula: string, fn: () => { valor: number | null; n: number }) => {
    const r = indicadorVacio(empresa, fecha, id, dates[0] ?? fecha, dates.at(-1) ?? fecha, moneda); r.formula = formula;
    r.calendarioSesiones = [...dates];
    if (complete) {
      const x = fn();
      if (x.valor !== null && Number.isFinite(x.valor)) {
        r.valor = x.valor; r.observaciones = x.n; r.fuentes = rows.map(s => ({ ...s.fuente }));
        r.conocidoDesde = rows.map(s => s.conocidoDesde).sort().at(-1)!;
      }
    }
    if (r.valor === null) r.limitaciones.push('Calendario incompleto o falta el dato bursátil específico validado. Un cierre repetido no prueba ausencia de negociación.');
    r.limitaciones.push('Ventana y mercado deben coincidir con comparables; un diagnóstico no determina rentabilidad exigida.');
    result.push(r);
  };
  const unavailable = { valor: null, n: 0 };
  const volumes = rows.map(s => s.volumenAcciones);
  const money = rows.map(s => s.volumenMonetario);
  const validVol = volumes.every(v => finite(v) && v >= 0);
  calc('VOLUMEN_ACCIONES', 'Media diaria de acciones negociadas', () => validVol ? { valor: media(volumes as number[]), n: rows.length } : unavailable);
  calc('VOLUMEN_MONETARIO', 'Media diaria del importe efectivamente negociado (no cierre × volumen inferido)', () => money.every(v => finite(v) && v >= 0) ? { valor: media(money as number[]), n: rows.length } : unavailable);
  calc('DIAS_SIN_NEGOCIACION', 'Número de sesiones confirmadas con volumen cero', () => validVol ? { valor: volumes.filter(v => v === 0).length, n: rows.length } : unavailable);
  calc('CV_VOLUMEN', 'Desviación muestral del volumen / volumen medio', () => validVol && rows.length >= 2 && media(volumes as number[]) > 0
    ? { valor: desviacionMuestral(volumes as number[])! / media(volumes as number[]), n: rows.length } : unavailable);
  calc('TURNOVER_FREE_FLOAT', 'Media diaria de volumen acciones / acciones free float del día', () => validVol && rows.every(s => finite(s.accionesFreeFloat) && s.accionesFreeFloat > 0)
    ? { valor: media(rows.map(s => s.volumenAcciones! / s.accionesFreeFloat!)), n: rows.length } : unavailable);
  calc('FREE_FLOAT', 'Media de fracción de acciones free float validada', () => rows.every(s => finite(s.freeFloatFraccion) && s.freeFloatFraccion >= 0 && s.freeFloatFraccion <= 1)
    ? { valor: media(rows.map(s => s.freeFloatFraccion!)), n: rows.length } : unavailable);
  calc('SPREAD_COTIZADO', 'Media de (ask−bid)/((ask+bid)/2), cotizaciones simultáneas', () => rows.every(s => s.cotizacionSimultanea && finite(s.bid) && finite(s.ask) && s.bid > 0 && s.ask >= s.bid)
    ? { valor: media(rows.map(s => (s.ask! - s.bid!) / ((s.ask! + s.bid!) / 2))), n: rows.length } : unavailable);
  calc('AMIHUD', 'Media de |retorno diario ajustado| / importe negociado; excluye solo volumen monetario cero confirmado; sin escala 1e6', () => {
    if (!money.every(v => finite(v) && v >= 0)) return unavailable;
    const traded = rows.filter(s => s.volumenMonetario! > 0);
    if (!traded.length || !traded.every(s => finite(s.retornoAjustado) && s.retornoAjustado >= -1)) return unavailable;
    return { valor: media(traded.map(s => Math.abs(s.retornoAjustado!) / s.volumenMonetario!)), n: traded.length };
  });
  return result;
}
