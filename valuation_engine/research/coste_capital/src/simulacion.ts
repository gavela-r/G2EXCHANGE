import type { Familia } from './tipos';
/** Única API numérica de impacto: explícitamente hipotética, nunca estima primas. */
export interface Tasa { valor: number; unidad: 'FRACCION_ANUAL' | 'PUNTOS_BASICOS'; }
export function fraccion(t: Tasa): number {
  if (!Number.isFinite(t.valor)) throw new Error('Tasa no finita');
  if (t.unidad === 'FRACCION_ANUAL') return t.valor;
  if (t.unidad === 'PUNTOS_BASICOS') return t.valor / 10000;
  throw new Error('Unidad de tasa desconocida; no inferir porcentajes');
}
export interface BaseHipotetica {
  uso: 'PRUEBA_HIPOTETICA'; familia: Familia;
  ke: Tasa; kd: Tasa; pesoPatrimonio: number; pesoDeuda: number; tasaImpositiva: number;
}
export interface EfectoHipotetico {
  id: string; componente: 'KE' | 'KD'; variacion: Tasa;
  riesgo: string; evidenciaNoDuplicidad: string;
  /** Necesario para reducciones: prima presente y conciliada en el componente base. */
  referencia?: { riesgo: string; componente: 'KE' | 'KD'; primaIncluida: Tasa; justificacion: string };
}
export function simularImpactoHipotetico(base: BaseHipotetica, efectos: EfectoHipotetico[]) {
  if (base.uso !== 'PRUEBA_HIPOTETICA' || ['BANK', 'INSURANCE', 'REIT'].includes(base.familia)) throw new Error('Solo simulación FCFF hipotética; familias equity requieren otro modelo');
  const { pesoPatrimonio: e, pesoDeuda: d, tasaImpositiva: t } = base;
  if (![e, d, t].every(x => Number.isFinite(x) && x >= 0 && x <= 1) || Math.abs(e + d - 1) > 1e-12) throw new Error('Pesos/fiscalidad inválidos');
  const ke = fraccion(base.ke), kd = fraccion(base.kd);
  if (ke < 0 || kd < 0) throw new Error('Coste base negativo no soportado');
  const risks = new Set<string>(), ids = new Set<string>();
  let deltaKe = 0, deltaKd = 0;
  const detalle = efectos.map(x => {
    if (!['KE', 'KD'].includes(x.componente) || !x.id.trim() || !x.riesgo.trim() || !x.evidenciaNoDuplicidad.trim()
      || risks.has(x.riesgo) || ids.has(x.id)) throw new Error('Riesgo/ID duplicado o evidencia insuficiente');
    risks.add(x.riesgo); ids.add(x.id);
    const delta = fraccion(x.variacion);
    if (delta < 0) {
      const r = x.referencia;
      if (!r || r.riesgo !== x.riesgo || r.componente !== x.componente || !r.justificacion.trim()
        || fraccion(r.primaIncluida) <= 0 || fraccion(r.primaIncluida) > (x.componente === 'KE' ? ke : kd)
        || -delta > fraccion(r.primaIncluida) + 1e-12) throw new Error('Reducción sin prima base conciliada del mismo riesgo/componente');
    }
    if (x.componente === 'KE') deltaKe += delta; else deltaKd += delta;
    return { id: x.id, estado: delta > 0 ? 'POSITIVO' as const : delta < 0 ? 'NEGATIVO' as const : 'CERO' as const,
      impactoWacc: x.componente === 'KE' ? delta * e : delta * d * (1 - t) };
  });
  const adjustedKe = ke + deltaKe, adjustedKd = kd + deltaKd;
  if (adjustedKe < 0 || adjustedKd < 0) throw new Error('Ajuste produce coste negativo no soportado');
  const original = ke * e + kd * (1 - t) * d;
  const adjusted = adjustedKe * e + adjustedKd * (1 - t) * d;
  if (![original, adjusted, adjustedKe, adjustedKd].every(Number.isFinite)) throw new Error('Resultado numérico fuera de rango');
  return { uso: 'PRUEBA_HIPOTETICA' as const, aplicableProduccion: false as const,
    waccOriginal: original, waccHipotetico: adjusted, deltaWacc: adjusted - original,
    keHipotetico: adjustedKe, kdHipotetico: adjustedKd, detalle };
}
