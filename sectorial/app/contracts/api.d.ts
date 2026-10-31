// Contratos de la API sectorial (G2_SECTORIAL_DEV_0.3). Base: /api/sectorial. Ejemplos reales: sectorial/app/mocks/*.json.
// Regla general: si un cálculo no es posible, el valor es null y existe un estado/causa tipados. Nunca hay valores ficticios.

export type ISODate = string; // AAAA-MM-DD
export type Hash = string;    // sha256 hex (64)

export interface ApiError { error: string; code: ErrorCode; }
export type ErrorCode =
  | 'HOST_NO_AUTORIZADO' | 'ORIGEN_NO_AUTORIZADO' | 'SESION_LOCAL_REQUERIDA' | 'CODIGO_CAMBIADO'
  | 'MODELO_INEXISTENTE' | 'PARAMETRO_INVALIDO' | 'FECHA_INVALIDA' | 'BUSQUEDA_DEMASIADO_LARGA' | 'SOLO_MODO_MOCK'
  | 'CAMPO_NO_ADMITIDO' | 'CAMPO_CONFIGURACION_NO_ADMITIDO' | 'DATOS_CAMBIADOS' | 'CONFIGURACION_RECHAZADA'
  | 'ID_EJECUCION_INVALIDO' | 'EJECUCION_INEXISTENTE' | 'REPLAY_NO_COINCIDE'
  | 'PRIMA_FUERA_DE_RANGO' | 'FACTOR_INVALIDO' | 'MOTIVO_REQUERIDO'
  | 'ARCHIVO_SIN_VALIDACION' | 'COLA_LLENA' | 'EXCEL_NO_DISPONIBLE' | 'COBERTURA_NO_CALCULADA'
  | 'JSON_INVALIDO' | 'SOLICITUD_DEMASIADO_GRANDE' | 'RUTA_NO_DISPONIBLE' | 'METODO_NO_ADMITIDO' | 'ARCHIVO_NO_DISPONIBLE'
  | 'NO_ENCONTRADO' | 'MYSQL_NO_DISPONIBLE' | 'MYSQL_NO_ACCESIBLE' | 'SOLICITUD_RECHAZADA';

export interface Health { status: 'OK'; version: string; mode: DataSource; }
export type DataSource = 'MYSQL_SOLO_LECTURA' | 'MOCK_SINTETICO';
export interface Session {
  version: string; mode: string; dataSource: DataSource; databaseWrites: false;
  token: string;            // enviar como cabecera X-Sectorial-Token en todo POST
  engineHash: Hash; buildStale: boolean;
  capabilities: { xlsxGenerator: 'ARTIFACT_TOOL_INDITEX' | 'PORTABLE_SHEETJS'; nativeValidation: string; downloadPolicy: string };
}

export type Family = 'FCFF' | 'BANK' | 'INSURANCE' | 'REIT';
export interface SectorModel {
  id: number; name: string; family: Family; method: 'FCFF' | 'FCFE_CAPITAL_REQUERIDO' | 'AFFO_EQUITY';
  revenueDrivers: string[]; drivers: string[]; constants: string[]; openingExtras: string[]; requiredHistory: string[];
  descriptions: Record<string, string>; scope: string;
}

export interface CompanySummary { id: number; nombre_empresa: string; sector_id: number | null; nombre_sector: string | null; codigo_iso: string; ticker: string | null; }

export type Validation = 'VALIDADO' | 'PENDIENTE' | 'CONFLICTIVO';
export interface Field { value: number | null; validation: Validation; code: string; reason: string | null; recordIds: number[]; verificationId?: number | null; unit?: string; scale?: number; }
export interface Observation { value: number | null; rawValue: string | null; recordId: number; concept: string; code: string; validation: Validation; reason: string | null; currency: string | null; unit: string | null; scale: number | null; basis: string | null; norm: string | null; periodStart: ISODate | null; periodEnd: ISODate; publication: ISODate; verificationId?: number | null; evidenceHash?: string; sourceHash?: string; source?: string; }
export interface Period { reportId: number; fiscalYear: number; periodStart: ISODate | null; periodEnd: ISODate; publication: ISODate; document: string; provider: string; currency: string | null; basis: string | null; norm: string | null; fields: Record<string, Field>; observations: Observation[]; issues: unknown[]; }
export interface Classification { sectorId: number | null; sectorName: string | null; model: number | null; status: 'RESUELTO' | 'BLOQUEADO'; method: string; evidence: unknown; reason: string | null; declared?: DeclaredClassification; }
export interface Snapshot { version: string; readAt: string; asOf: ISODate; company: { id: number; nombre_empresa: string; sector_id: number | null; nombre_sector: string | null; codigo_iso: string }; instruments: unknown[]; classification: Classification; periods: Period[]; issues: Issue[]; source: string; immutableHistory: true; inputHash: Hash; }

export interface Issue { code: string; kind?: 'DATOS' | 'METODO'; field?: string; period?: ISODate; message?: string; }
export interface Notice { code: 'CLASIFICACION_DECLARADA_POR_ANALISTA' | string; model?: number; message: string; }
export type RunStatus = 'BLOQUEADO' | 'CALCULADO_PENDIENTE_REVISION';
export interface ScenarioResult {
  id: 1 | 2 | 3; name: 'Conservador' | 'Base' | 'Optimista'; status: RunStatus;
  valuePerShare: number | null; rawCalculatedValue: number | null;
  states: Record<string, (number | null)[]>; // 5 ejercicios; null = no estimable
  capital: { rates: unknown | null; premiums: PremiumDiagnosis }; warnings: string[];
}
export interface ValuationResult {
  version: string; source: 'EMPRESA_MYSQL' | 'QA_SINTETICO_NO_EMPRESA'; company: Snapshot['company']; asOf: ISODate;
  inputHash: Hash; configurationHash: Hash; resultHash?: Hash; model: SectorModel | null;
  calendar: { periods: { start: ISODate; end: ISODate; fiscalStart?: ISODate; fiscalEnd?: ISODate }[]; issues: string[]; policy?: string } | null;
  status: RunStatus; financialApproval: 'PENDIENTE'; issues: Issue[]; notices: Notice[];
  scenarios: ScenarioResult[]; requiredInputs: { id: string; sheet: string; row: number; col: number; label: string; unit: string }[];
  history: Period[]; classification: Classification; capitalModule: { version: string; modified: false };
}
export interface CompanyResponse { snapshot: Snapshot; result: ValuationResult; }

// Hipótesis: cada valor lleva fuente y fecha (≤ asOf). Ver mocks/example_configuration_sector04.json.
export interface Cited { value: number | null; source: string; referenceDate: ISODate; }
export interface CitedSeries { values: (number | null)[]; source: string; referenceDate: ISODate; } // 5 ejercicios
export interface DeclaredClassification { model: number; source: string; reviewer: string; reason: string; referenceDate: ISODate; }
export interface Configuration {
  companyId: number; inputHash: Hash;
  scenarios: [Record<string, CitedSeries>, Record<string, CitedSeries>, Record<string, CitedSeries>];
  constants?: Record<string, Cited>; assets?: unknown[]; calendar?: unknown[]; terminalSource?: string;
  valuationBridge?: { asOf: ISODate; currency: string; basis: string; norm: string; source: string; reviewer: string; balances: Record<string, Cited> };
  accountingPolicy?: { source: string; referenceDate: ISODate; reviewer: string; scope: 'PERIMETRO_COMPLETO'; lines: unknown[] };
  classification?: DeclaredClassification;
  /** Días de circulante: SOBRE_VENTAS (G2, por defecto: DSO, DIO y DPO sobre ingresos) o CONVENCIONAL (DIO sobre coste, DPO sobre compras). */
  workingCapitalDays?: 'SOBRE_VENTAS' | 'CONVENCIONAL';
}
export interface EvaluateRequest { asOf: ISODate; configuration: Configuration; }
export interface EvaluateResponse { id: Hash; result: ValuationResult; }
export interface RunResponse { id: Hash; result: ValuationResult; createdAt: string; engineHash: Hash; }

export interface PremiumFactor { factor: 'LIQUIDEZ_BURSATIL' | 'TAMANO_RESIDUAL'; primaCalculada: number | null; ajusteOperativo: number; estadoFinanciero: 'POSITIVO' | 'NEGATIVO' | 'CERO' | 'NO_ESTIMABLE' | 'YA_INCORPORADO' | 'NO_APLICABLE'; estadoAplicacion: string; motivo: string; }
export interface PremiumDiagnosis { primas: PremiumFactor[]; advertencia?: string; [k: string]: unknown; }
export interface CapitalResponse { id: Hash; status: RunStatus; model: { id: number; family: Family; method: string } | null; scenarios: { id: number; name: string; status: RunStatus; ke: number | null; kd: number | null; wacc: number | null; discountRate: number | null; rates: unknown; premiums: PremiumDiagnosis; warnings: string[] }[]; }
export interface PremiumSimulationRequest { factor: 'LIQUIDEZ' | 'TAMANO' | 'OTRO'; premium: number; reason: string; } // premium en fracción anual, [-0.05, 0.10]
export interface PremiumSimulation {
  status: 'SIMULACION_NO_APROBADA' | 'NO_SIMULABLE'; approved?: false; persisted?: false; method?: 'KE_MAS_PRIMA_VIA_RF';
  scenarios: { scenario: number; status: 'SIMULADO' | 'VALOR_NO_ESTIMABLE' | 'NO_SIMULABLE'; base: Rates | null; simulated: Rates | null; delta?: { ke: number | null; valuePerShare: number | null } }[];
}
export interface Rates { ke: number | null; wacc: number | null; discountRate: number | null; valuePerShare: number | null; }

export type ExportJobStatus = 'NO_SOLICITADO' | 'PENDIENTE' | 'GENERANDO' | 'COMPLETADO' | 'ERROR';
export interface ExportJob { id: Hash; status: ExportJobStatus; code?: string; error?: string; createdAt?: string; finishedAt?: string; url?: string; }

export type KpiStatus = 'CERTIFICADO' | 'BLOQUEADO_DEPENDENCIA' | 'NO_CALCULABLE';
export interface Kpi { code: string; unit: 'PORCENTAJE' | 'MONEDA' | 'VECES' | 'DIAS'; periodEnd: ISODate; status: KpiStatus; value: number | null; cause: string | null; warnings: string[]; inputs: { field: string; validation: Validation | 'AUSENTE'; value: number | null; recordIds: number[]; verificationId: number | null; reason: string | null }[]; }
export interface KpiResponse { company: Snapshot['company']; asOf: ISODate; inputHash: Hash; definitions: { code: string; unit: string; inputs: string[] }[]; periods: { periodEnd: ISODate; kpis: Kpi[] }[]; }
export interface PcvResponse { company: Snapshot['company']; asOf: ISODate; inputHash: Hash; periods: Omit<Period, 'reportId' | 'issues' | 'periodStart'>[]; issues: Issue[]; }

export interface CoverageRow { country: 'US' | 'JP' | 'TW'; year: number; companies: number; companiesWithReport: number; pcv: { expected: number; present: number; certified: number; conflict: number; absent: number; notApplicable: number; grossCoverage: number | null; certifiedCoverage: number | null; [k: string]: unknown }; kpi: { expected: number; certified: number; certifiedCoverage: number | null; [k: string]: unknown }; [k: string]: unknown; }
export interface CoverageResponse { generatedAt: string; source: DataSource; matrix: CoverageRow[]; [k: string]: unknown; }
