import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
let compiledHashEnMemoria:string|undefined;
export function raizProyecto(start=__dirname): string {
  let dir=path.resolve(start);
  while(true) {
    if(fs.existsSync(path.join(dir,'server/package.json')) && fs.existsSync(path.join(dir,'valuation_engine/package.json'))) return dir;
    const parent=path.dirname(dir);
    if(parent===dir) throw new Error('No se encuentra raíz G2EXCHANGE');
    dir=parent;
  }
}
export function rutaMotor(...parts:string[]):string { return path.join(raizProyecto(),'valuation_engine',...parts); }
function verificarVersionEnMemoria() {
  const built=JSON.parse(fs.readFileSync(rutaMotor('dist/build-manifest.json'),'utf8'));
  if(compiledHashEnMemoria&&compiledHashEnMemoria!==built.compiledHash)throw new Error('Motor recompilado durante ejecución: reiniciar el worker antes de valorar');
  compiledHashEnMemoria=built.compiledHash;
  return built;
}
export function manifiestoMotor():{version:string;hash:string} {
  const current=require(rutaMotor('scripts/manifest.cjs')).current(),built=verificarVersionEnMemoria();
  const canonical=(v:Record<string,unknown>)=>JSON.stringify(Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])));
  if(canonical(current)!==canonical(built))throw new Error('Motor compilado desactualizado: ejecutar npm run build');
  return {version:built.version,hash:crypto.createHash('sha256').update(canonical(built)).digest('hex')};
}
export function cargarMotor(): typeof import('g2-motor/modelo') { verificarVersionEnMemoria();return require(rutaMotor('dist/src/modelo.js')); }
export function cargarCalidad(): typeof import('g2-motor/integracion/calidad') { verificarVersionEnMemoria();return require(rutaMotor('dist/src/integracion/calidad.js')); }
export function cargarMotorHistorico(hash:string,version:string):typeof import('g2-motor/modelo') {
  if(!/^[a-f0-9]{64}$/.test(hash))throw new Error('Huella histórica inválida');
  const root=rutaMotor('archives',hash),script=require(rutaMotor('scripts/manifest.cjs'));
  if(!fs.existsSync(root))throw new Error('Motor histórico no archivado: no sustituir por la versión actual');
  const manifest=script.current(root);
  if(manifest.version!==version||script.archiveId(manifest)!==hash)throw new Error('Integridad del motor histórico incompatible');
  return require(path.join(root,'dist/src/modelo.js'));
}
