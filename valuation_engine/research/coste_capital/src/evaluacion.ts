import { construirBenchmark, cumpleFiltros } from './comparables';
import { DEFINICIONES, dias, fechaValida, fuenteValida } from './indicadores';
import type { Benchmark, Incorporacion, Indicador, Propuesta } from './tipos';

export const VERSION_METODOLOGIA = 'DIAGNOSTICO_BIDIRECCIONAL_1.0.0';
/** Registro cerrado: ninguna metodología de rentabilidad ha sido calibrada/autorizada con datos de G2. */
export const METODOLOGIAS = Object.freeze([
  Object.freeze({ id: 'AMIHUD_2002_INDICADOR', clase: 'CONSOLIDADA', cuantificacionAutorizada: false, url: 'https://doi.org/10.1016/S1386-4181(01)00024-6' }),
  Object.freeze({ id: 'LCAPM_ACHARYA_PEDERSEN_2005', clase: 'EMPIRICA_DISCUTIDA', cuantificacionAutorizada: false, url: 'https://doi.org/10.1016/j.jfineco.2004.06.007' }),
  Object.freeze({ id: 'FF_SMB_1993', clase: 'EMPIRICA_DISCUTIDA', cuantificacionAutorizada: false, url: 'https://doi.org/10.1016/0304-405X(93)90023-5' }),
  Object.freeze({ id: 'SIZE_QUALITY_2018', clase: 'EMPIRICA_DISCUTIDA', cuantificacionAutorizada: false, url: 'https://doi.org/10.1016/j.jfineco.2018.05.006' })
]);
function avisosDuplicidad(i: Indicador): string[] {
  const out = ['No ajustar flujos y tasa por el mismo riesgo sin conciliación explícita.'];
  if (i.factor === 'TAMANO' || i.factor === 'LIQUIDEZ_BURSATIL') out.push('Tamaño y liquidez bursátil pueden compartir exposición: aislar efecto residual antes de sumar propuestas.');
  if (i.factor === 'INSOLVENCIA_REFINANCIACION' || i.factor === 'LIQUIDEZ_FINANCIERA') out.push('Revisar spread/rating, beta apalancada, deuda, fiscalidad, FCFF y puente EV→equity.');
  if (i.factor === 'COMERCIABILIDAD') out.push('Descuento de la participación puede duplicar iliquidez ya reflejada en Ke/precio.');
  return out;
}
export function evaluarIndicador(i: Indicador, benchmark: Benchmark | null, incorporaciones: Incorporacion[] = []): Propuesta {
  const d = DEFINICIONES[i.id];
  const validEvidence = incorporaciones.filter(e => e.indicadores.includes(i.id) && e.justificacion.trim() && e.riesgo.trim()
    && fuenteValida(e.fuente) && fechaValida(e.conocidoDesde) && e.conocidoDesde <= i.fechaValoracion);
  const p: Propuesta = {
    empresa: { ...i.empresa }, fechaValoracion: i.fechaValoracion, factor: d.factor, indicador: JSON.parse(JSON.stringify(i)),
    benchmark: null, referencia: null, diferencia: null, posicionPercentil: null, direccion: 'DESCONOCIDO', estado: 'NO_ESTIMABLE',
    metodologia: VERSION_METODOLOGIA, nivelEvidencia: 'DIAGNOSTICO', confianza: 'INFORMACION_INSUFICIENTE',
    limitaciones: [...i.limitaciones], posiblesDuplicidades: avisosDuplicidad(i), incorporaciones: JSON.parse(JSON.stringify(validEvidence)),
    componentesARevisar: [...d.componentes], componenteAfectado: 'SIN_DETERMINAR', ajustePropuesto: null, unidadAjuste: 'FRACCION_ANUAL',
    justificacion: 'No existe una metodología cuantitativa calibrada y autorizada para convertir esta diferencia en prima.', aplicableProduccion: false
  };
  if (d.noAplicableA.includes(i.empresa.familia)) {
    p.estado = 'NO_APLICABLE'; p.justificacion = 'La definición industrial no se aplica a esta familia de valoración.'; return p;
  }
  if (!fechaValida(i.fechaValoracion) || !fechaValida(i.periodoInicio) || !fechaValida(i.periodoFin) || i.periodoInicio > i.periodoFin
    || i.periodoFin > i.fechaValoracion || !i.conocidoDesde || !fechaValida(i.conocidoDesde) || i.conocidoDesde < i.periodoFin || i.conocidoDesde > i.fechaValoracion
    || i.valor === null || !Number.isFinite(i.valor) || i.observaciones < 1 || i.unidad !== d.unidad || i.factor !== d.factor
    || !i.fuentes.length || i.fuentes.some(f => !fuenteValida(f))) {
    p.limitaciones.push('Observación ausente/incompatible o no disponible en la fecha de valoración.'); return p;
  }
  p.confianza = 'DATOS_VALIDADOS_SIN_CALIBRACION';
  if (benchmark) {
    const r = benchmark.reglas;
    if (benchmark.empresaObjetivo !== i.empresa.id || r.fecha !== i.fechaValoracion || r.indicador !== i.id
      || r.unidad !== i.unidad || r.moneda !== i.moneda || !cumpleFiltros(i.empresa, r)
      || i.periodoInicio < r.periodoInicio || i.periodoFin > r.periodoFin || !r.duracionesDiasAdmitidas.includes(dias(i.periodoInicio, i.periodoFin))
      || (d.factor === 'LIQUIDEZ_BURSATIL' && JSON.stringify(i.calendarioSesiones) !== JSON.stringify(r.sesionesEsperadas))) {
      p.limitaciones.push('Benchmark incompatible con empresa, fecha, periodo, unidad o moneda.'); return p;
    }
    // Reconstruir estadística: no aceptar medianas manipuladas o miembros futuros suministrados por un consumidor.
    const checked = construirBenchmark(i.empresa, r, benchmark.miembros);
    checked.exclusiones = [...benchmark.exclusiones.map(e => ({ ...e })), ...checked.exclusiones];
    p.benchmark = checked;
    if (checked.estadisticas) {
      p.referencia = checked.estadisticas.mediana; p.diferencia = i.valor - p.referencia;
      const xs = checked.miembros.map(m => m.valor!);
      p.posicionPercentil = 100 * (xs.filter(v => v < i.valor!).length + .5 * xs.filter(v => v === i.valor).length) / xs.length;
      if (p.diferencia === 0) p.direccion = 'NEUTRAL';
      else if (d.relacion !== 'SIN_RELACION_MONOTONA') {
        const favorable = d.relacion === 'MAYOR_FAVORABLE' ? p.diferencia > 0 : p.diferencia < 0;
        p.direccion = favorable ? 'FAVORABLE' : 'DESFAVORABLE';
      }
      p.limitaciones.push(`Comparación descriptiva con ${xs.length} empresas; no prueba significación ni causalidad. Igualdad exacta, sin umbrales de riesgo inventados.`);
      if (d.relacion === 'SIN_RELACION_MONOTONA') p.limitaciones.push('Una diferencia de escala/tamaño no establece por sí sola dirección del riesgo.');
    }
  }
  const total = validEvidence.filter(e => e.cobertura === 'TOTAL');
  if (total.length) {
    p.estado = 'YA_INCORPORADO'; p.ajustePropuesto = 0;
    p.componenteAfectado = total.length === 1 ? total[0].componente : 'SIN_DETERMINAR';
    p.justificacion = 'Evidencia explícita declara el riesgo de este indicador totalmente incorporado; ajuste adicional cero.';
  } else if (validEvidence.some(e => e.cobertura === 'PARCIAL')) {
    p.limitaciones.push('Cobertura parcial: falta aislar el riesgo residual; no declarar YA_INCORPORADO ni cuantificarlo.');
  } else if (p.direccion === 'NEUTRAL') {
    p.estado = 'CERO'; p.ajustePropuesto = 0;
    p.justificacion = 'Sin diferencia observada respecto a la referencia: no se propone ajuste incremental. No demuestra ausencia de riesgo absoluto.';
  }
  if (!p.benchmark?.estadisticas) p.limitaciones.push('Sin referencia comparable válida.');
  return p;
}
export function detectarDuplicidades(propuestas: Propuesta[]): string[] {
  const factors = new Set(propuestas.map(p => p.factor));
  const out: string[] = [];
  if (factors.has('TAMANO') && factors.has('LIQUIDEZ_BURSATIL')) out.push('TAMANO_LIQUIDEZ: no sumar sin efecto tamaño residual controlando liquidez, calidad, mercado y apalancamiento.');
  if (factors.has('LIQUIDEZ_FINANCIERA') && factors.has('INSOLVENCIA_REFINANCIACION')) out.push('LIQUIDEZ_CREDITO: conciliar ratios, rating y spread; no duplicar riesgo de refinanciación.');
  if (factors.has('COMERCIABILIDAD') && factors.has('LIQUIDEZ_BURSATIL')) out.push('COMERCIABILIDAD_KE: revisar descuento sobre participación frente a prima de liquidez.');
  return out;
}
