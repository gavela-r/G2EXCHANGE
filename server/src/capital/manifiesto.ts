import fs from 'node:fs';
import path from 'node:path';
import {raizProyecto} from '../valoracion/rutas';
const root=raizProyecto(),manifestFile=path.join(root,'server/dist-capital/build-manifest.json');
const loadedManifest=fs.existsSync(manifestFile)?JSON.parse(fs.readFileSync(manifestFile,'utf8')):null;
/** Copia del código financiero utilizado, sin .env, datos privados ni dependencias. */
export function manifiestoCapital(){
 const M=require(path.join(root,'server/scripts/capital-manifest.cjs')),current=M.inspect();
 if(!loadedManifest||loadedManifest.version!==current.version||loadedManifest.sourceHash!==current.sourceHash||loadedManifest.compiledHash!==current.compiledHash)throw Error('BUILD_CAPITAL_DESACTUALIZADO: compilar con capital:build y reiniciar el servicio; no registrar cálculos con otra versión');
 const sources:Record<string,string>={...current.source,...current.js};
 const digest=M.hash(loadedManifest),archive=path.join(root,'valuation_engine/research/coste_capital/fase3/archives',digest);
 fs.mkdirSync(archive,{recursive:true});for(const [f,text]of Object.entries(sources)){const destination=path.join(archive,f);fs.mkdirSync(path.dirname(destination),{recursive:true});
  try{fs.writeFileSync(destination,text,{flag:'wx'});}catch(e:any){if(e.code!=='EEXIST'||fs.readFileSync(destination,'utf8')!==text)throw e;}
 }
 return {...loadedManifest,archiveHash:digest,node:process.version,platform:process.platform,archivo:archive,files:Object.keys(sources)};
}
