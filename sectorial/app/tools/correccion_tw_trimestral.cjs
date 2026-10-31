// Corrección de Taiwán TW_ANUAL_TRIMESTRAL_V1: los PCV de resultados de los informes ANUALES de FinMind se guardaron
// con la fila del cuarto trimestre aislado (TaiwanStockFinancialStatements). MySQL SÓLO LECTURA; genera las sentencias
// (directorio privado) sobre pcv_correccion_auditoria (migración 31):
//  - una fila se corrige sólo si su importe es EXACTAMENTE el del T4 aislado del mismo `type` en la caché de FinMind
//    (prueba del defecto) y existen los 4 trimestres sin contradicciones; nuevo importe = T1+T2+T3+T4
//    (server/src/pcv/finmindTrimestral.ts);
//  - EPS (no aditivo) nunca se corrige: se informa aparte como pendiente;
//  - cada UPDATE exige id e importe anterior; auditoría y rollback por conjuntos.
// No certifica nada (FinMind no es fuente primaria): sólo corrige la periodización de datos ya guardados.
// Uso: G2_PROJECT_ROOT=<proyecto> node tools/correccion_tw_trimestral.cjs <dirCacheFinMind> <dirPrivado>
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const{database}=require('../runtime.cjs');
const T=require(path.resolve(__dirname,'../../../server/dist/src/pcv/finmindTrimestral'));
const REGLA='TW_ANUAL_TRIMESTRAL_V1',VERSION='2026-10-31',ACCION='CORREGIR_ANUAL_DESDE_TRIMESTRES';

async function main(cache,dir){
 const pool=database(),c=await pool.getConnection();let filas;
 try{await c.query('START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY');
  [filas]=await c.query(`SELECT p.id,p.informe_id,p.concepto,p.importe,t.concepto_estandar code,DATE_FORMAT(i.fecha_fin_periodo,'%Y-%m-%d') fin,MIN(ins.ticker) ticker FROM partida_contable_valor p JOIN taxonomia_concepto t ON t.id=p.concepto_estandar_id JOIN informe_financiero i ON i.id=p.informe_id JOIN empresa e ON e.id=i.empresa_id JOIN pais pa ON pa.id=e.pais_id JOIN instrumento ins ON ins.empresa_id=e.id WHERE pa.codigo_iso='TW' AND i.fuente='FINMIND' AND i.tipo_periodo='ANUAL' AND YEAR(i.fecha_fin_periodo) BETWEEN 2022 AND 2025 AND p.importe IS NOT NULL GROUP BY p.id,p.informe_id,p.concepto,p.importe,t.concepto_estandar,i.fecha_fin_periodo`);
  await c.rollback();}finally{c.release();await pool.end();}
 const porTicker=new Map(),res={generatedAt:new Date().toISOString(),rule:REGLA,ruleVersion:VERSION,filasRevisadas:0,corregibles:0,epsPendientes:0,sinCache:0,noEsT4:0,trimestresIncompletos:0,porConcepto:{}},ledger=[];
 for(const f of filas){
  let cacheT=porTicker.get(f.ticker);
  if(cacheT===undefined){const file=path.join(cache,'raw',f.ticker+'.json');cacheT=fs.existsSync(file)?(()=>{const bytes=fs.readFileSync(file),hechos=JSON.parse(bytes).map(r=>({dataset:T.DATASET_TRIMESTRAL,date:r.date,type:r.type,value:Number(r.value)})),m=new Map();for(const h of hechos)(m.get(h.date)??m.set(h.date,[]).get(h.date)).push(h);return{m,sha:crypto.createHash('sha256').update(bytes).digest('hex')};})():null;porTicker.set(f.ticker,cacheT);}
  if(!cacheT){res.sinCache++;continue;}
  const t4=(cacheT.m.get(f.fin)??[]).filter(h=>h.type===f.concepto);if(t4.length!==1||t4[0].value!==Number(f.importe))continue;   // no procede de la fila trimestral
  res.filasRevisadas++;
  if(T.NO_ADITIVOS.has(f.code)){res.epsPendientes++;continue;}
  const anual=T.anualDesdeTrimestres(f.code,t4[0],cacheT.m,f.fin);
  if(anual===null){res.trimestresIncompletos++;continue;}
  if(anual===Number(f.importe)){res.noEsT4++;continue;}
  res.corregibles++;res.porConcepto[f.code]=(res.porConcepto[f.code]??0)+1;
  ledger.push({pcv_id:f.id,informe_id:f.informe_id,concept:f.code,tag:f.concepto,fin:f.fin,ticker:f.ticker,before:Number(f.importe),after:anual,quarters:T.cierresTrimestrales(f.fin).map(d=>cacheT.m.get(d).find(h=>h.type===f.concepto).value),cacheSha256:cacheT.sha});
 }
 const texto=ledger.map(x=>JSON.stringify(x)).join('\n')+'\n',L=crypto.createHash('sha256').update(texto).digest('hex'),q=v=>v===null?'NULL':typeof v==='number'?String(v):"'"+String(v).replace(/'/g,"''")+"'";
 fs.mkdirSync(dir,{recursive:true});const base=path.join(dir,`tw_trimestral_${L.slice(0,12)}`);fs.writeFileSync(base+'.ndjson',texto);
 const up=[`-- ${REGLA} (lote ${L}). Generado ${new Date().toISOString()}. Requiere el esquema 31.`,'SET autocommit=0;'];
 ledger.forEach((x,i)=>{if(i%500===0){if(i)up.push('COMMIT;');up.push('START TRANSACTION;');}
  up.push(`INSERT INTO pcv_correccion_auditoria(ledger_sha256,informe_id,concept_code,pcv_id,regla,version_regla,accion,importe_anterior,importe_nuevo,conflicto_evidence_hash) SELECT ${q(L)},p.informe_id,${q(x.concept)},p.id,${q(REGLA)},${q(VERSION)},${q(ACCION)},p.importe,${x.after},${q(x.cacheSha256)} FROM partida_contable_valor p WHERE p.id=${x.pcv_id} AND p.informe_id=${x.informe_id} AND p.importe=${x.before} AND NOT EXISTS (SELECT 1 FROM pcv_correccion_auditoria a WHERE a.ledger_sha256=${q(L)} AND a.pcv_id=${x.pcv_id} AND a.revertido_en IS NULL);`);
  up.push(`UPDATE partida_contable_valor SET importe=${x.after} WHERE id=${x.pcv_id} AND informe_id=${x.informe_id} AND importe=${x.before};`);});
 up.push('COMMIT;');fs.writeFileSync(base+'.sql',up.join('\n')+'\n');
 fs.writeFileSync(base+'.rollback.sql',[`-- Rollback ${REGLA} (lote ${L}).`,'SET autocommit=0;','START TRANSACTION;',`UPDATE partida_contable_valor p JOIN pcv_correccion_auditoria a ON a.pcv_id=p.id AND a.informe_id=p.informe_id SET p.importe=a.importe_anterior WHERE a.ledger_sha256=${q(L)} AND a.revertido_en IS NULL AND a.accion=${q(ACCION)} AND p.importe=a.importe_nuevo;`,`UPDATE pcv_correccion_auditoria SET revertido_en=CURRENT_TIMESTAMP WHERE ledger_sha256=${q(L)} AND revertido_en IS NULL;`,'COMMIT;'].join('\n')+'\n');
 Object.assign(res,{ledgerSha256:L,archivos:{registro:base+'.ndjson',datos:base+'.sql',rollback:base+'.rollback.sql'}});fs.writeFileSync(base+'.manifest.json',JSON.stringify(res,null,2));return res;
}
if(require.main===module){const[cache,dir]=process.argv.slice(2);if(!cache||!dir){console.error('Uso: node tools/correccion_tw_trimestral.cjs <dirCacheFinMind> <dirPrivado>');process.exit(2);}
 main(path.resolve(cache),path.resolve(dir)).then(r=>console.log(JSON.stringify(r,null,1))).catch(e=>{console.error(e.stack);process.exitCode=1;});}
