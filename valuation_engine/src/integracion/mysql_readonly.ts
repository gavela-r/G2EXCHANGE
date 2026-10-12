/** Historical reads use the frozen input. Legacy runs cannot be reproduced from current market tables. */
import type { Pool,PoolConnection,RowDataPacket } from 'mysql2/promise';
import type { ModeloInput } from '../tipos';
export type Unidad='UNITS'|'MILLIONS';
export interface ImportOptions {financialUnit:Unidad;sharesUnit:Unidad;templateCode:string;instrumentId?:number;expectedEngineVersion?:string;expectedManifestHash?:string;allowLegacyReading?:boolean;changeNwcMillions?:[number|undefined,number|undefined,number|undefined,number|undefined];riskInputs?:ModeloInput['risk_inputs'];sectorSpecific?:ModeloInput['sector_specific'];}
export async function exportarInputDesdeRun(db:Pick<Pool|PoolConnection,'query'>,runId:number,opts?:ImportOptions):Promise<ModeloInput>{
 if(!Number.isSafeInteger(runId)||runId<=0)throw new Error('runId entero positivo obligatorio');
 let rows:RowDataPacket[];
 try{[rows]=await db.query<RowDataPacket[]>(`SELECT ve.*,vr.empresa_id,vr.input_snapshot_id,vr.template_code FROM valuation_execution ve JOIN valuation_run vr ON vr.id=ve.valuation_run_id WHERE ve.valuation_run_id=?`,[runId]);}
 catch(e:any){if(e.code==='ER_NO_SUCH_TABLE')throw new Error('Migración pendiente: faltan inputs congelados; no reconstruir históricos con parámetros actuales');throw e;}
 if(rows.length!==1)throw new Error('LEGACY_NOT_FROZEN: run sin evidencia; preparar una nueva valoración');
 const row=rows[0],input=(typeof row.input_json==='string'?JSON.parse(row.input_json):row.input_json) as ModeloInput;
 if(Number(input.company_id)!==Number(row.empresa_id)||Number(input.instrument_id)!==Number(row.instrumento_id)||Number(input.input_snapshot_id)!==Number(row.input_snapshot_id)||Number(input.valuation_run_id)!==runId)throw new Error('Identidad congelada inconsistente');
 if(opts?.instrumentId!==undefined&&Number(input.instrument_id)!==opts.instrumentId)throw new Error('Instrumento solicitado distinto del congelado');
 if(opts?.templateCode&&input.template_code!==opts.templateCode)throw new Error('Plantilla solicitada distinta del RUN');
 if(opts?.expectedEngineVersion&&row.engine_version!==opts.expectedEngineVersion)throw new Error('REPLAY_ENGINE_MISMATCH: utilizar la versión histórica del motor');
 if(opts?.expectedManifestHash&&row.manifest_hash!==opts.expectedManifestHash)throw new Error('REPLAY_MANIFEST_MISMATCH: utilizar el código y configuración históricos');
 if(opts?.riskInputs||opts?.sectorSpecific||opts?.changeNwcMillions)throw new Error('Input histórico inmutable: crear nueva valoración para cambiar hipótesis');
 return JSON.parse(JSON.stringify(input));
}
