/** Todos los datos de este archivo son HIPOTÉTICOS y solo sirven para pruebas. */
import { calcularFinancieros, calcularBursatiles, calcularCapitalizacion, construirBenchmark, evaluarIndicador } from '../src';
import type { CampoFinanciero, Dato, Empresa, IdIndicador, Indicador, PeriodoFinanciero, Sesion } from '../src';
export const fecha = '2026-01-15';
export const fuente = { identificador: 'HIPOTETICO_SOLO_PRUEBAS', url: 'https://example.invalid/hipotetico' };
export const empresa: Empresa = { id: 'EMPRESA_HIPOTETICA', sector: 'SECTOR_PRUEBA', pais: 'US', region: 'NORTEAMERICA', mercado: 'MERCADO_HIPOTETICO', modeloNegocio: 'MODELO_PRUEBA', familia: 'FCFF' };
export function dato(valor: number | null, unidad: Dato['unidad'] = 'MONEDA', fechaDato = '2025-12-31'): Dato {
  return { valor, unidad, moneda: unidad === 'MONEDA' || unidad === 'MONEDA_POR_ACCION' ? 'USD' : undefined,
    fecha: fechaDato, conocidoDesde: fechaDato, fuente: { ...fuente }, validado: true };
}
export function periodo(overrides: Partial<Record<CampoFinanciero, number | null>> = {}): PeriodoFinanciero {
  const values: Record<CampoFinanciero, number | null> = { efectivo: 1000, deudaFinancieraCP: 20, deudaFinancieraLP: 80,
    activosCorrientes: 2000, pasivosCorrientes: 200, inventarios: 300, prepagos: 100, ebit: 500,
    interesesGastoPositivo: 10, ebitda: 600, cfo: 700, capexSalidaPositiva: 100, ingresos: 5000, activosTotales: 10000, activosOperativos: 9000, ...overrides };
  return { inicio: '2025-01-01', fin: '2025-12-31', datos: Object.fromEntries(Object.entries(values).map(([k, v]) => [k, dato(v)])) };
}
export function financieros(overrides: Partial<Record<CampoFinanciero, number | null>> = {}) { return calcularFinancieros(empresa, fecha, 'USD', periodo(overrides)); }
export function sesiones(volumen: number): Sesion[] {
  return ['2026-01-12', '2026-01-13'].map(day => ({ fecha: day, conocidoDesde: day, fuente: { ...fuente }, validado: true,
    volumenAcciones: volumen, volumenMonetario: volumen * 10, retornoAjustado: .01, accionesFreeFloat: 1000000,
    freeFloatFraccion: .8, bid: 9.99, ask: 10.01, cotizacionSimultanea: true }));
}
export function bursatiles(volumen: number) { const s = sesiones(volumen); return calcularBursatiles(empresa, fecha, 'USD', s.map(s => s.fecha), s); }
export function capitalizacion(acciones: number): Indicador {
  return calcularCapitalizacion(empresa, fecha, 'USD', dato(10, 'MONEDA_POR_ACCION'), dato(acciones, 'ACCIONES'),
    { mismaClase: true, splitsConciliados: true, baseAcciones: 'EN_CIRCULACION' });
}
export function buscar(xs: Indicador[], id: IdIndicador): Indicador { return xs.find(x => x.id === id)!; }
export function comparar(i: Indicador, referencia: number) {
  const peer = (id: string, valor: number): Indicador => ({ ...i, empresa: { ...i.empresa, id }, valor, fuentes: [{ ...fuente }] });
  const b = construirBenchmark(i.empresa, { id: 'BENCHMARK_HIPOTETICO', versionMetodologia: 'PRUEBA_1', fecha,
    periodoInicio: i.periodoInicio, periodoFin: i.periodoFin, indicador: i.id, unidad: i.unidad, moneda: i.moneda,
    filtros: { sector: empresa.sector, pais: empresa.pais, modeloNegocio: empresa.modeloNegocio, familia: empresa.familia,
      mercado: i.factor === 'LIQUIDEZ_BURSATIL' ? empresa.mercado : undefined },
    justificacionSeleccion: 'Comparables hipotéticos; ninguna calibración financiera real.', variablesControl: ['SECTOR', 'CALIDAD'],
    variableEstudiada: i.factor, duracionesDiasAdmitidas: [(Date.parse(i.periodoFin) - Date.parse(i.periodoInicio)) / 86400000 + 1],
    sesionesEsperadas: i.calendarioSesiones
  }, [peer('COMPARABLE_HIPOTETICO_1', referencia), peer('COMPARABLE_HIPOTETICO_2', referencia)]);
  return { benchmark: b, propuesta: evaluarIndicador(i, b) };
}
if (require.main === module) {
  const large = comparar(capitalizacion(1e9), 1e8).propuesta;
  const liquid = comparar(buscar(bursatiles(100000), 'VOLUMEN_MONETARIO'), 10000).propuesta;
  console.log(JSON.stringify({ uso: 'HIPOTETICO_SOLO_PRUEBAS', large, liquid }, null, 2));
}
