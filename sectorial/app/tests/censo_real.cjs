// Censo acotado de empresas reales (MySQL sólo lectura): ¿qué falta para valorar? No guarda runs ni escribe en MySQL.
const fs=require('node:fs'),path=require('node:path');
const {database,readOnly}=require('../runtime.cjs'),adapter=require('../adapter.cjs'),{evaluate}=require('../workflow.cjs'),{model}=require('../registry.cjs');
const asOf=process.argv[2]??'2026-10-30',limit=Math.min(Number(process.argv[3]??30),40);
(async()=>{const pool=database();try{
 const top=await readOnly(pool,async db=>(await db.query(`SELECT i.empresa_id id,COUNT(*) verified FROM pcv_verification_evidence v JOIN informe_financiero i ON i.id=v.informe_id WHERE v.outcome='VERIFIED_EXISTING' AND i.tipo_periodo='ANUAL' GROUP BY i.empresa_id ORDER BY verified DESC LIMIT ${limit}`))[0]);
 const companies=[];
 for(const{id,verified}of top){
  try{const snap=await readOnly(pool,db=>adapter.loadCompany(db,id,asOf)),x=evaluate(snap),m=model(snap.classification.model);
   const coverage=m?Object.fromEntries(m.requiredHistory.map(k=>[k,snap.periods.filter(p=>p.fields[k]?.validation==='VALIDADO'&&p.fields[k]?.value!=null).length])):null;
   const tally={};for(const p of snap.periods)for(const f of Object.values(p.fields))tally[f.validation]=(tally[f.validation]??0)+1;
   companies.push({id,name:snap.company.nombre_empresa,country:snap.company.codigo_iso,verified,model:m?.id??null,classification:snap.classification.status,periods:snap.periods.map(p=>p.periodEnd),currencies:[...new Set(snap.periods.map(p=>p.currency))],validation:tally,historyComplete:m?m.requiredHistory.every(k=>coverage[k]===4):false,missingHistory:coverage?Object.entries(coverage).filter(([,n])=>n<4).map(([k,n])=>k+':'+n+'/4'):null,calendarIssues:x.result.issues.filter(i=>i.code==='CALENDARIO_PENDIENTE').length,blockCodes:[...new Set(x.result.issues.map(i=>i.code))],status:x.result.status});
  }catch(e){companies.push({id,verified,error:e.message.slice(0,300)});}
 }
 const summary={at:new Date().toISOString(),asOf,scanned:companies.length,historyComplete:companies.filter(c=>c.historyComplete).map(c=>c.id),calculable:companies.filter(c=>c.status!=='BLOQUEADO').length,companies};
 fs.writeFileSync(path.join(__dirname,'../evidencias/censo_real_'+asOf+'.json'),JSON.stringify(summary,null,2));
 for(const c of companies)console.log([c.id,c.country,c.model,c.name,c.status,c.historyComplete?'HIST_COMPLETA':'',(c.missingHistory??[]).slice(0,6).join(' '),c.error??''].join(' | '));
 console.log(JSON.stringify({scanned:summary.scanned,historyComplete:summary.historyComplete,calculable:summary.calculable}));
}finally{await pool.end();}})().catch(e=>{console.error(e.message);process.exitCode=1;});
