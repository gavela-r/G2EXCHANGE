import fs from 'node:fs';
import path from 'node:path';
import conexion from '../../conexion/bd';
import { obtenerPlantillaPorSector } from './mapeoSectores';
import { rutaMotor, manifiestoMotor } from './rutas';
import type { ImportOptions } from 'g2-motor/integracion/mysql_readonly';
export function obtenerRutaMotor():string { const p=rutaMotor('dist/src/modelo.js');if(!fs.existsSync(p))throw new Error('Compilar motor: '+p);return p; }
export function obtenerAdaptadorMySQL():typeof import('g2-motor/integracion/mysql_readonly') {const p=path.join(path.dirname(obtenerRutaMotor()),'integracion/mysql_readonly.js');return require(p);}
/** Frozen historical input only. New hypotheses go through prepararInstrumento. */
export async function importarDatosValoracion(runId:number,opciones:Partial<ImportOptions>={},payload:Record<string,unknown>={}) {
 if(Object.keys(payload).length)throw new Error('Input histórico inmutable: crear nueva valoración con hipótesis por instrumento');
 const manifest=manifiestoMotor();
 return obtenerAdaptadorMySQL().exportarInputDesdeRun(conexion,runId,{...opciones,expectedEngineVersion:manifest.version,expectedManifestHash:manifest.hash} as ImportOptions);
}
export function resolverPlantillaFinanciera(sectorId:number):string {return obtenerPlantillaPorSector(sectorId);}
export function resolverConfiguracionFinanciera(sectorId:number):{templateCode:string;valuationMethodFamily:string} {
 const templateCode=resolverPlantillaFinanciera(sectorId),dir=rutaMotor('generator/sector_configs');
 const files=fs.readdirSync(dir).filter(n=>n.startsWith(templateCode+'_')&&n.endsWith('.json'));
 if(files.length!==1)throw new Error('Configuración plantilla ausente o ambigua');
 const c=JSON.parse(fs.readFileSync(path.join(dir,files[0]),'utf8'));
 if(c.code!==templateCode||!['FCFF','RESOURCE','PHARMA','BANK','INSURANCE','REIT'].includes(c.family))throw new Error('Configuración financiera incompatible');
 return {templateCode,valuationMethodFamily:c.family};
}
