// Se ejecuta sin red, con entradas congeladas y motor archivado montados de sólo lectura.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const engine='/audit/valuation_engine',rows=JSON.parse(fs.readFileSync(path.join(engine,'research/coste_capital/fase3/evidencias/frozen-runtime-inputs.local.json')));
const {compararCongelado}=require('/audit/regresion.js');
const canonical=v=>JSON.stringify(normalize(v));function normalize(v){if(Array.isArray(v))return v.map(normalize);if(v&&typeof v==='object')return Object.fromEntries(Object.keys(v).sort().map(k=>[k,normalize(v[k])]));return v;}
const replays=[];for(const r of rows){try{if(!/^[a-f0-9]{64}$/.test(r.manifest_hash))throw Error('Archivo inválido');const archive=path.join(engine,'archives',r.manifest_hash),M=require(path.join(engine,'scripts/manifest.cjs'));if(M.archiveId(M.current(archive))!==r.manifest_hash)throw Error('Huella de motor no coincide');
 const input=JSON.parse(r.input_json),stored=JSON.parse(r.output_json),actual=require(path.join(archive,'dist/src/modelo.js')).valorar(input);
 const comparison=compararCongelado(stored,actual,{input,output:stored});
 replays.push({run:r.valuation_run_id,status:comparison.exact?'EXACT_MATCH':comparison.numericallyEquivalent?'IEEE754_EQUIVALENT':'FAIL',outputHash:crypto.createHash('sha256').update(canonical(actual)).digest('hex'),comparison});
 }catch(e){replays.push({run:r.valuation_run_id,status:'FAIL',error:e.message});}}
console.log(JSON.stringify({at:new Date().toISOString(),runtime:process.version,platform:process.platform,arch:process.arch,network:'NONE',engineMount:'READ_ONLY',inputs:'FROZEN_ONLY',exact:replays.filter(r=>r.status==='EXACT_MATCH').length,numericallyEquivalent:replays.filter(r=>r.status==='IEEE754_EQUIVALENT').length,total:rows.length,replays},null,2));
if(replays.some(r=>r.status==='FAIL'))process.exitCode=1;
