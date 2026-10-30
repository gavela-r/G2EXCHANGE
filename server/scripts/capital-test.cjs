const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const root=path.resolve(__dirname,'../..'),out=path.join(root,process.env.CAPITAL_TEST_OUTPUT??'valuation_engine/research/coste_capital/fase3/evidencias');fs.mkdirSync(out,{recursive:true});
const results=[];
function run(name,args){const r=cp.spawnSync(process.execPath,args,{cwd:root,encoding:'utf8',env:{...process.env,NO_COLOR:'1'}});const log=(r.stdout||'')+(r.stderr||'');fs.writeFileSync(path.join(out,name+'.txt'),log);const result={name,exit:r.status,pass:Number(log.match(/(?:# |ℹ )pass (\d+)/)?.[1]??0),fail:Number(log.match(/(?:# |ℹ )fail (\d+)/)?.[1]??0),signal:r.signal};results.push(result);console.log(JSON.stringify(result));return r.status===0;}
let ok=run('build-capital',['server/scripts/capital-build.cjs']);
ok=run('typecheck-backend',['server/node_modules/typescript/bin/tsc','-p','server/tsconfig.json','--noEmit'])&&ok;
if(ok){
 ok=run('pruebas-capital',['--test',...fs.readdirSync(path.join(root,'server/tests')).filter(f=>/^capital.*\.test\.cjs$/.test(f)).map(f=>'server/tests/'+f)])&&ok;
 ok=run('regresion-modulos-previos',['--test',...fs.readdirSync(path.join(root,'valuation_engine/dist/tests')).filter(f=>f.endsWith('.test.js')).map(f=>'valuation_engine/dist/tests/'+f),'valuation_engine/research/coste_capital/dist/tests/modulo.test.js'])&&ok;
 ok=run('regresion-backend-previo',['--require','./server/tests/config.cjs','--test',...['valoracion','rating','evidencia','secAnualVerificado','accionesEmitidasJp'].map(f=>'server/tests/'+f+'.test.cjs')])&&ok;
}
fs.writeFileSync(path.join(out,'pruebas-resumen.json'),JSON.stringify({at:new Date().toISOString(),runtime:process.version,results,totalPass:results.reduce((s,r)=>s+r.pass,0),totalFail:results.reduce((s,r)=>s+r.fail,0),ok},null,2));if(!ok)process.exitCode=1;
