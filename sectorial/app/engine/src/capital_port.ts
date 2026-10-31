/** Contrato futuro; deliberadamente sin lector HTTP/SQL ni activador de primas. */
export interface SolicitudCapital {empresaId:string;asOf:string;escenario:'CONSERVATIVE'|'BASE'|'OPTIMISTIC';inputHash:string;moneda:string;metodo:'FCFF'|'FCFE_REGULATORIO'|'AFFO';}
export interface ComponentesCapital {keBase:number|null;kdBase:number|null;pesoEquity:number|null;pesoDeuda:number|null;impuesto:number|null;incorporacionesBase:{familia:string;componente:'KE'|'KD';importeAnual:number;evidenciaHash:string}[];}
export interface DecisionAjuste {id:string;familia:'LIQUIDEZ'|'TAMANO'|'CONCENTRACION';componente:'KE'|'KD';primaCalculada:number|null;ajusteOperativo:number;estadoFinanciero:'NO_ESTIMABLE'|'CERO'|'ESTIMADO'|'YA_INCORPORADO';estadoAplicacion:'BLOQUEADO'|'PENDIENTE'|'APROBADO';metodoHash:string|null;inputHash:string;referenciaAsOf:string;moneda:string;evidenciaHash:string;aprobacionId:string|null;}
export interface CapitalPort {leerComponentes(s:SolicitudCapital):Promise<ComponentesCapital>;leerDecisiones(s:SolicitudCapital):Promise<DecisionAjuste[]>;}
// Esta versión usa exclusivamente CAPM base de escenarios sintéticos. El puerto no está conectado.
// CONCENTRACION es una capacidad futura del contrato; no modifica enums, rutas ni decisiones de Capital v2.
