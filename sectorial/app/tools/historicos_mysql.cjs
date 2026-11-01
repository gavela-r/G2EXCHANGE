// Extrae, en solo lectura, los históricos anuales 2022–2025 de cada empresa tal como los valida el adaptador sectorial
// (adapter.mapPeriod: misma evidencia, moneda, base y perímetro que la API). Base reproducible para la validación
// retrospectiva y la medición de cobertura. Sólo informes publicados en o antes de --as-of.
// Uso: G2_PROJECT_ROOT=<proyecto con .env> node tools/historicos_mysql.cjs <salida.json> [--as-of 2026-10-31] [--ids 1,2]
const path=require('node:path'),fs=require('node:fs');
const APP=path.resolve(__dirname,'..'),A=require(path.join(APP,'adapter.cjs')),{serviceRequire,project}=require(path.join(APP,'runtime.cjs'));
const {MAPEO_SECTORES}=require(path.join(APP,'vendor/mapeoSectores.cjs'));
const arg=(k,d)=>{const i=process.argv.indexOf(k);return i>=0?process.argv[i+1]:d;};
// Réplica de adapter.loadCompany con los ejercicios fijados (2022–2025) en lugar de "los cuatro últimos".
async function cargarEjercicios(db,id,asOf,years=[2022,2023,2024,2025]){
 const[[company]]=await db.query('SELECT e.id,e.nombre_empresa,e.sector_id,s.nombre_sector,p.codigo_iso FROM empresa e JOIN pais p ON p.id=e.pais_id LEFT JOIN sector s ON s.id=e.sector_id WHERE e.id=?',[id]);
 const classification=await A.resolverClasificacion(db,company,asOf);
 const fuentes=A.FUENTES_PAIS[company.codigo_iso];
 const[reports]=await db.query(`SELECT id,empresa_id,fecha_fin_periodo,fecha_publicacion,fuente,identificador_fuente FROM informe_financiero WHERE empresa_id=? AND tipo_periodo='ANUAL' AND fuente IN (?) AND YEAR(fecha_fin_periodo) BETWEEN ? AND ? AND fecha_publicacion<=? AND EXISTS(SELECT 1 FROM partida_contable_valor p WHERE p.informe_id=informe_financiero.id) ORDER BY fecha_fin_periodo DESC,fecha_publicacion DESC,id DESC`,[id,fuentes,years[0],years.at(-1),asOf]);
 const periods=[],issues=[],seen=new Set();
 for(const report of reports){const year=Number(report.fecha_fin_periodo.slice(0,4));if(seen.has(year))continue;seen.add(year);
  if(reports.filter(x=>x.fecha_fin_periodo===report.fecha_fin_periodo).length>1)issues.push({code:'INFORME_AMBIGUO',year});
  if(reports.some(x=>Number(x.fecha_fin_periodo.slice(0,4))===year&&x.fecha_fin_periodo!==report.fecha_fin_periodo))issues.push({code:'DOS_CIERRES_EN_EL_EJERCICIO',year});
  const[raw]=await db.query('SELECT p.id,p.concepto,p.importe,p.nivel_confianza,t.concepto_estandar,t.unidad_tipo,t.alias_sec,t.alias_edinet FROM partida_contable_valor p LEFT JOIN taxonomia_concepto t ON t.id=p.concepto_estandar_id WHERE informe_id=? ORDER BY p.id LIMIT 1501',[report.id]);
  const[proofs]=await db.query('SELECT id,concept_code,outcome,evidence_hash,evidence_json FROM pcv_verification_evidence WHERE informe_id=? ORDER BY id DESC LIMIT 2501',[report.id]);
  const[ev]=await db.query('SELECT evidence_json FROM financial_report_evidence WHERE informe_id=? LIMIT 2',[report.id]);
  if(raw.length>1500||proofs.length>2500)issues.push({code:'LIMITE_LECTURA',year});
  periods.push(A.mapPeriod(raw,proofs,report,ev.length===1?(typeof ev[0].evidence_json==='string'?JSON.parse(ev[0].evidence_json):ev[0].evidence_json):null));
 }
 periods.reverse();
 return{company,classification,periods,issues};
}
// Forma compacta: por ejercicio, valor y estado de cada campo (VALIDADO, DERIVADO, NO_APLICABLE, CONFLICTIVO, PENDIENTE).
function compacto(s){
 return{id:s.company.id,nombre:s.company.nombre_empresa,pais:s.company.codigo_iso,plantilla:s.classification.model??s.classification.nominal??null,clasificacion:s.classification.status,metodoClasificacion:s.classification.method,
  issues:s.issues.map(x=>x.code),ejercicios:s.periods.map(p=>({fy:p.fiscalYear,fin:p.periodEnd,publicado:p.publication,moneda:p.currency,base:p.basis,norma:p.norm,problemas:p.issues,
   campos:Object.fromEntries(Object.entries(p.fields).map(([k,f])=>[k,{v:f.validation==='VALIDADO'||f.validation==='NO_APLICABLE'?f.value:null,e:f.validation==='VALIDADO'&&f.derivation?'DERIVADO':f.validation,...(f.perimeter!==undefined?{per:f.perimeter}:{}),...(f.derivation?{d:f.derivation.rule}:{})}]))}))};
}
module.exports={cargarEjercicios,compacto};
if(require.main===module)(async()=>{
 const out=path.resolve(process.argv[2]),asOf=arg('--as-of','2026-10-31'),only=arg('--ids',null);
 const dotenv=serviceRequire('dotenv'),mysql=serviceRequire('mysql2/promise'),cfg=dotenv.parse(fs.readFileSync(path.join(project,'.env'))),env=k=>process.env[k]??cfg[k];
 const pool=mysql.createPool({host:env('DB_HOST')??'localhost',port:Number(env('DB_PORT')??3307),user:env('DB_USER'),password:env('DB_PASSWORD'),database:env('DB_NAME'),dateStrings:true,timezone:'Z',connectionLimit:4,decimalNumbers:false});
 const ro=async fn=>{const c=await pool.getConnection();try{await c.query('START TRANSACTION READ ONLY');return await fn({query:(s,p=[])=>{if(!/^\s*SELECT\b/i.test(s))throw Error('solo SELECT');return c.query(s,p);}});}finally{await c.rollback();c.release();}};
 const[ids]=only?[only.split(',').map(Number).map(id=>({id}))]:await pool.query("SELECT e.id FROM empresa e JOIN pais p ON p.id=e.pais_id WHERE p.codigo_iso IN ('US','JP','TW') ORDER BY e.id");
 const empresas=[],errores=[];let i=0;
 await Promise.all([1,2,3,4].map(async()=>{while(i<ids.length){const id=ids[i++].id;try{empresas.push(compacto(await ro(db=>cargarEjercicios(db,id,asOf))));}catch(e){errores.push({id,error:e.message});}if((empresas.length+errores.length)%2000===0)console.error(empresas.length+errores.length,'/',ids.length);}}));
 const[[t]]=await pool.query('SELECT UTC_TIMESTAMP(6) at,DATABASE() db');empresas.sort((a,b)=>a.id-b.id);
 fs.writeFileSync(out,JSON.stringify({version:'G2_HISTORICOS_0.1',medidoEn:t.at,base:t.db,asOf,universo:ids.length,errores,empresas}));
 console.log(JSON.stringify({empresas:empresas.length,errores:errores.length,salida:out}));await pool.end();
})().catch(e=>{console.error(e);process.exit(1);});
