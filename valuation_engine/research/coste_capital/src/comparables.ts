import { DEFINICIONES, desviacionMuestral, dias, fechaValida, fuenteValida, media } from './indicadores';
import type { Benchmark, Empresa, Indicador, ReglasComparables } from './tipos';

/** Interpolación lineal (n−1)p; estadística descriptiva, nunca umbral de prima. */
export function percentil(xs: number[], p: number): number | null {
  if (!Number.isFinite(p) || p < 0 || p > 1) throw new Error('Percentil debe estar entre 0 y 1');
  if (!xs.length || xs.some(x => !Number.isFinite(x))) return null;
  const sorted = [...xs].sort((a, b) => a - b), position = (sorted.length - 1) * p;
  const lower = Math.floor(position), upper = Math.ceil(position);
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
}
export function cumpleFiltros(e: Empresa, r: ReglasComparables): boolean {
  return Object.entries(r.filtros).every(([k, v]) => v === undefined || e[k as keyof Empresa] === v);
}
export function construirBenchmark(objetivo: Empresa, reglas: ReglasComparables, candidatos: Indicador[]): Benchmark {
  const bursatil = DEFINICIONES[reglas.indicador].factor === 'LIQUIDEZ_BURSATIL';
  if (!reglas.id.trim() || !reglas.versionMetodologia.trim() || !reglas.justificacionSeleccion.trim()
    || !fechaValida(reglas.fecha) || !fechaValida(reglas.periodoInicio) || !fechaValida(reglas.periodoFin)
    || reglas.periodoInicio > reglas.periodoFin || reglas.periodoFin > reglas.fecha
    || reglas.unidad !== DEFINICIONES[reglas.indicador].unidad
    || !reglas.filtros.familia || (!reglas.filtros.sector && !reglas.filtros.modeloNegocio)
    || !reglas.variableEstudiada.trim() || reglas.variablesControl.includes(reglas.variableEstudiada)
    || !reglas.duracionesDiasAdmitidas.length || reglas.duracionesDiasAdmitidas.some(d => !Number.isInteger(d) || d < 1)
    || (['MONEDA', 'INV_MONEDA'].includes(reglas.unidad) && !/^[A-Z]{3}$/.test(reglas.moneda ?? ''))
    || !cumpleFiltros(objetivo, reglas)
    || (bursatil && (!reglas.filtros.mercado || !reglas.sesionesEsperadas?.length
      || new Set(reglas.sesionesEsperadas).size !== reglas.sesionesEsperadas.length
      || reglas.sesionesEsperadas.some((s, n, a) => !fechaValida(s) || s < reglas.periodoInicio || s > reglas.periodoFin || (n > 0 && s <= a[n - 1]))))) {
    throw new Error('Reglas comparables incompletas/incoherentes; se requiere sector o modelo de negocio y familia; bursátiles exigen mercado y calendario');
  }
  // Duplicados no se resuelven eligiendo el dato más reciente sin evidencia histórica de revisión.
  const counts = new Map<string, number>();
  candidatos.forEach(c => counts.set(c.empresa.id, (counts.get(c.empresa.id) ?? 0) + 1));
  const miembros: Indicador[] = [], exclusiones: Benchmark['exclusiones'] = [];
  for (const c of candidatos) {
    let motivo = '';
    if (c.empresa.id === objetivo.id) motivo = 'Empresa objetivo excluida';
    else if (counts.get(c.empresa.id)! > 1) motivo = 'Observaciones duplicadas por empresa: resolver versión explícitamente';
    else if (!cumpleFiltros(c.empresa, reglas)) motivo = 'Fuera de sector/país/región/modelo/familia seleccionados';
    else if (c.id !== reglas.indicador || c.unidad !== reglas.unidad || c.moneda !== reglas.moneda || c.factor !== DEFINICIONES[c.id].factor) motivo = 'Indicador, factor, unidad o moneda distintos';
    else if (DEFINICIONES[c.id].noAplicableA.includes(c.empresa.familia)) motivo = 'Indicador no aplicable a familia';
    else if (bursatil && JSON.stringify(c.calendarioSesiones) !== JSON.stringify(reglas.sesionesEsperadas)) motivo = 'Calendario bursátil diferente';
    else if (c.valor === null || !Number.isFinite(c.valor) || c.observaciones < 1 || !c.fuentes.length || c.fuentes.some(f => !fuenteValida(f))) motivo = 'Sin valor/evidencia válida';
    else if (!fechaValida(c.periodoInicio) || !fechaValida(c.periodoFin) || c.periodoInicio > c.periodoFin
      || c.periodoInicio < reglas.periodoInicio || c.periodoFin > reglas.periodoFin || !c.conocidoDesde || !fechaValida(c.conocidoDesde)
      || c.conocidoDesde < c.periodoFin || c.conocidoDesde > reglas.fecha || c.periodoFin > reglas.fecha) motivo = 'Periodo incompatible o información futura/desconocida';
    else if (!reglas.duracionesDiasAdmitidas.includes(dias(c.periodoInicio, c.periodoFin))) motivo = 'Duración no comparable';
    if (motivo) exclusiones.push({ empresaId: c.empresa.id, motivo });
    else miembros.push(JSON.parse(JSON.stringify(c)) as Indicador);
  }
  miembros.sort((a, b) => a.empresa.id.localeCompare(b.empresa.id));
  const xs = miembros.map(c => c.valor!);
  return { reglas: JSON.parse(JSON.stringify(reglas)) as ReglasComparables, empresaObjetivo: objetivo.id, miembros, exclusiones,
    estadisticas: xs.length ? { n: xs.length, media: media(xs), mediana: percentil(xs, .5)!, p25: percentil(xs, .25)!, p75: percentil(xs, .75)!,
      minimo: Math.min(...xs), maximo: Math.max(...xs), desviacionMuestral: desviacionMuestral(xs) } : null };
}
