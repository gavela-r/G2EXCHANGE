/** Contrato interno de investigación. Tasas en fracciones anuales; dinero en unidades, nunca millones implícitos. */
export type Direccion = 'FAVORABLE' | 'DESFAVORABLE' | 'NEUTRAL' | 'DESCONOCIDO';
export type EstadoAjuste = 'POSITIVO' | 'NEGATIVO' | 'CERO' | 'NO_ESTIMABLE' | 'NO_APLICABLE' | 'YA_INCORPORADO';
export type Factor = 'LIQUIDEZ_FINANCIERA' | 'LIQUIDEZ_BURSATIL' | 'INSOLVENCIA_REFINANCIACION' | 'COMERCIABILIDAD' | 'TAMANO';
export type Componente = 'KE' | 'KD' | 'ESTRUCTURA' | 'FCFF' | 'EQUITY_VALUE' | 'ESCENARIOS' | 'SIN_DETERMINAR';
export type Familia = 'FCFF' | 'RESOURCE' | 'PHARMA' | 'BANK' | 'INSURANCE' | 'REIT';
export type Unidad = 'MONEDA' | 'MONEDA_POR_ACCION' | 'ACCIONES' | 'VECES' | 'FRACCION' | 'INV_MONEDA' | 'DIAS';
export type Confianza = 'DATOS_VALIDADOS_SIN_CALIBRACION' | 'INFORMACION_INSUFICIENTE';
export interface Empresa {
  id: string;
  sector: string;
  subsector?: string;
  pais: string;
  region: string;
  mercado: string;
  modeloNegocio: string;
  familia: Familia;
}
export interface Fuente { identificador: string; url: string; }
export interface Dato {
  valor: number | null;
  unidad: Unidad;
  moneda?: string;
  fecha: string;
  conocidoDesde: string;
  fuente: Fuente;
  validado: boolean;
}
export type IdIndicador =
  | 'EFECTIVO' | 'DEUDA_BRUTA' | 'DEUDA_NETA' | 'CURRENT_RATIO' | 'QUICK_RATIO' | 'CASH_RATIO'
  | 'COBERTURA_INTERESES' | 'DEUDA_NETA_EBITDA' | 'CFO' | 'FCF' | 'FCF_DEUDA' | 'VOLATILIDAD_FCF'
  | 'NECESIDAD_FINANCIACION' | 'VENCIMIENTOS' | 'CAPITALIZACION' | 'INGRESOS' | 'EBITDA'
  | 'ACTIVOS_TOTALES' | 'ACTIVOS_OPERATIVOS' | 'POSICION_COMPETITIVA' | 'ESTABILIDAD_OPERATIVA'
  | 'DIVERSIFICACION_GEOGRAFICA' | 'ACCESO_FINANCIACION' | 'VOLUMEN_ACCIONES' | 'VOLUMEN_MONETARIO'
  | 'TURNOVER_FREE_FLOAT' | 'FREE_FLOAT' | 'SPREAD_COTIZADO' | 'AMIHUD' | 'DIAS_SIN_NEGOCIACION' | 'CV_VOLUMEN'
  | 'DESCUENTO_COMERCIABILIDAD';
export interface Indicador {
  empresa: Empresa;
  fechaValoracion: string;
  id: IdIndicador;
  factor: Factor;
  valor: number | null;
  unidad: Unidad;
  moneda?: string;
  periodoInicio: string;
  periodoFin: string;
  conocidoDesde: string | null;
  fuentes: Fuente[];
  formula: string;
  observaciones: number;
  calendarioSesiones?: string[];
  limitaciones: string[];
}
export interface DefinicionIndicador {
  factor: Factor;
  unidad: Unidad;
  relacion: 'MAYOR_FAVORABLE' | 'MENOR_FAVORABLE' | 'SIN_RELACION_MONOTONA';
  componentes: Componente[];
  noAplicableA: Familia[];
}
export type CampoFinanciero = 'efectivo' | 'deudaFinancieraCP' | 'deudaFinancieraLP' | 'activosCorrientes'
  | 'pasivosCorrientes' | 'inventarios' | 'prepagos' | 'ebit' | 'interesesGastoPositivo' | 'ebitda'
  | 'cfo' | 'capexSalidaPositiva' | 'ingresos' | 'activosTotales' | 'activosOperativos';
export interface PeriodoFinanciero {
  inicio: string;
  fin: string;
  datos: Partial<Record<CampoFinanciero, Dato>>;
}
export interface Sesion {
  fecha: string;
  conocidoDesde: string;
  fuente: Fuente;
  validado: boolean;
  volumenAcciones?: number | null;
  volumenMonetario?: number | null;
  /** Retorno diario ajustado verificado por el proveedor. No se infiere de cierres sin ajustes. */
  retornoAjustado?: number | null;
  accionesFreeFloat?: number | null;
  freeFloatFraccion?: number | null;
  bid?: number | null;
  ask?: number | null;
  cotizacionSimultanea?: boolean;
}
export interface ReglasComparables {
  id: string;
  versionMetodologia: string;
  fecha: string;
  periodoInicio: string;
  periodoFin: string;
  indicador: IdIndicador;
  unidad: Unidad;
  moneda?: string;
  filtros: Partial<Pick<Empresa, 'sector' | 'subsector' | 'pais' | 'region' | 'mercado' | 'modeloNegocio'>> & { familia: Familia };
  justificacionSeleccion: string;
  variablesControl: string[];
  variableEstudiada: string;
  /** Lista explícita de duraciones admitidas; evita mezclar un trimestre con un año. */
  duracionesDiasAdmitidas: number[];
  sesionesEsperadas?: string[];
}
export interface Benchmark {
  reglas: ReglasComparables;
  empresaObjetivo: string;
  miembros: Indicador[];
  exclusiones: { empresaId: string; motivo: string }[];
  estadisticas: null | { n: number; media: number; mediana: number; p25: number; p75: number; minimo: number; maximo: number; desviacionMuestral: number | null };
}
export interface Incorporacion {
  riesgo: string;
  indicadores: IdIndicador[];
  componente: Componente;
  fuente: Fuente;
  conocidoDesde: string;
  justificacion: string;
  cobertura: 'TOTAL' | 'PARCIAL';
}
export interface Propuesta {
  empresa: Empresa;
  fechaValoracion: string;
  factor: Factor;
  indicador: Indicador;
  benchmark: Benchmark | null;
  referencia: number | null;
  diferencia: number | null;
  posicionPercentil: number | null;
  direccion: Direccion;
  estado: EstadoAjuste;
  metodologia: string;
  nivelEvidencia: 'DIAGNOSTICO' | 'CONSOLIDADA' | 'EMPIRICA_DISCUTIDA' | 'EXPERIMENTAL' | 'SIN_RESPALDO';
  confianza: Confianza;
  limitaciones: string[];
  posiblesDuplicidades: string[];
  incorporaciones: Incorporacion[];
  componentesARevisar: Componente[];
  componenteAfectado: Componente;
  ajustePropuesto: number | null;
  unidadAjuste: 'FRACCION_ANUAL';
  justificacion: string;
  aplicableProduccion: false;
}
