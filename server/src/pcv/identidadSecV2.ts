import type {InformePcv} from './normalizarProveedores';
import {identidadLegalSec as anterior,nombreLegalSec} from './identidadSec';
// A database label may remain unchanged after an official issuer rename. CIK
// continuity is accepted only when BOTH independent SEC datasets explicitly
// identify their names as the current or dated former legal name of that CIK.
// Neither a partial name nor a shared ticker establishes this relationship.
export function identidadLegalSec(i:InformePcv,cik:string,facts:any,submission:any):string|null {
 const old=anterior(i,cik,facts,submission);if(old)return old;
 if(!/^\d{10}$/.test(cik)||Number(facts?.cik)!==Number(cik)||Number(submission?.cik)!==Number(cik))return null;
 const aliases=new Set<string>([nombreLegalSec(submission?.name||'')]);
 for(const f of submission?.formerNames||[]){const from=String(f.from||'').slice(0,10),to=String(f.to||'').slice(0,10);if(/^\d{4}-\d{2}-\d{2}$/.test(from)&&/^\d{4}-\d{2}-\d{2}$/.test(to)&&!Number.isNaN(Date.parse(from))&&!Number.isNaN(Date.parse(to))&&from<=to)aliases.add(nombreLegalSec(f.name));}
 const databaseName=nombreLegalSec(i.nombre_empresa),factsName=nombreLegalSec(facts.entityName||'');
 return databaseName.length>=5&&factsName.length>=5&&aliases.has(databaseName)&&aliases.has(factsName)?'OFFICIAL_SAME_CIK_EXPLICIT_NAME_CONTINUITY':null;
}
