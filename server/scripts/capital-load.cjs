const fs=require('node:fs'),path=require('node:path');
const {options,target,checkTarget}=require('./capital-dev.cjs');checkTarget();
const mysql=require('../node_modules/mysql2/promise');
const P=require('../dist-capital/server/src/capital/proveedores');
const provider=process.argv[2]||'TWSE',limit=Number(process.argv[3]||5);
(async()=>{const pool=mysql.createPool({...options(),database:target,connectionLimit:2});try{
 const result=provider==='TWSE'?await P.cargarTaiwan(pool,limit,Number(process.argv[4]||0)):provider==='TPEX'?await P.cargarTpex(pool,limit):provider==='JP'?await P.cargarJapon():(()=>{throw Error('Proveedor no habilitado; ALPACA requiere evidencia contractual acreditada');})();
 const output={at:new Date().toISOString(),database:target,...result};
 const dir=path.resolve(__dirname,'../../valuation_engine/research/coste_capital/fase3/evidencias');fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,'carga-'+provider.toLowerCase()+'-'+Date.now()+'.json'),JSON.stringify(output,null,2));console.log(JSON.stringify(output));
 }finally{await pool.end();}})().catch(e=>{const failure={at:new Date().toISOString(),database:target,provider,status:'FAILED',error:e.message,storedObservationsUnknownUntilDatabaseCheck:true};const dir=path.resolve(__dirname,'../../valuation_engine/research/coste_capital/fase3/evidencias');fs.writeFileSync(path.join(dir,'carga-'+provider.toLowerCase()+'-fallo-'+Date.now()+'.json'),JSON.stringify(failure,null,2));console.error(JSON.stringify(failure));process.exitCode=1});
