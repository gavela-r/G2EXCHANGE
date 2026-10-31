// Causas de la ausencia de informe anual en EE. UU. (2022-2025). MySQL SÓLO LECTURA + archivos `submissions` oficiales
// de la SEC descargados (bulk). Para cada empresa del universo y ejercicio sin informe ANUAL SEC_EDGAR clasifica:
//  SIN_CIK                 ningún archivo submissions contiene el ticker de la empresa (identidad no resuelta)
//  CIK_AMBIGUO             el ticker aparece en varios CIK
//  ANUAL_DISPONIBLE:<form> la SEC tiene un 10-K, 10-K/A, 10-KT, 20-F o 40-F con fecha de cierre en ese ejercicio →
//                          recuperable (fallo de recuperación, no ausencia real)
//  SIN_ANUAL_<tipo>        la SEC no tiene informe anual de ese ejercicio (fondos, SPAC liquidadas, emisores sólo de
//                          deuda, filiales…), con el entityType/categoría de la SEC
// Uso: G2_PROJECT_ROOT=<proyecto> node tools/ausencias_us.cjs <dirSubmissions> [salida.json] [--candidatos f.ndjson]
const fs=require('node:fs'),path=require('node:path');
const{database}=require('../runtime.cjs');
const YEARS=[2022,2023,2024,2025],ANUALES=new Set(['10-K','10-K/A','10-KT','10-K405','20-F','20-F/A','40-F','40-F/A']);

function indiceSubmissions(dir){
 const porTicker=new Map(),porCik=new Map();
 for(const f of fs.readdirSync(dir)){if(!/^CIK\d{10}\.json$/.test(f))continue;let j;try{j=JSON.parse(fs.readFileSync(path.join(dir,f),'utf8'));}catch{continue;}
  const anuales=[];const add=r=>{for(let i=0;i<(r.form?.length??0);i++)if(ANUALES.has(r.form[i]))anuales.push({form:r.form[i],reportDate:r.reportDate[i],filingDate:r.filingDate[i],accn:r.accessionNumber[i]});};
  add(j.filings?.recent??{});
  for(const x of j.filings?.files??[]){try{add(JSON.parse(fs.readFileSync(path.join(dir,x.name),'utf8')));}catch{}}
  const info={cik:j.cik,name:j.name,entityType:j.entityType,category:j.category,sic:j.sic,anuales};porCik.set(j.cik,info);
  for(const t of j.tickers??[])(porTicker.get(String(t).toUpperCase())??porTicker.set(String(t).toUpperCase(),new Set()).get(String(t).toUpperCase())).add(j.cik);}
 return{porTicker,porCik};
}

async function main(dir,out,candFile){
 const{porTicker,porCik}=indiceSubmissions(dir);
 const pool=database(),c=await pool.getConnection();let empresas,informes;
 try{await c.query('START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY');
  [empresas]=await c.query(`SELECT e.id,e.nombre_empresa,GROUP_CONCAT(DISTINCT UPPER(i.ticker)) tickers FROM empresa e JOIN pais p ON p.id=e.pais_id LEFT JOIN instrumento i ON i.empresa_id=e.id WHERE p.codigo_iso='US' GROUP BY e.id`);
  [informes]=await c.query(`SELECT i.empresa_id,YEAR(i.fecha_fin_periodo) y FROM informe_financiero i JOIN empresa e ON e.id=i.empresa_id JOIN pais p ON p.id=e.pais_id WHERE p.codigo_iso='US' AND i.tipo_periodo='ANUAL' AND i.fuente='SEC_EDGAR' AND YEAR(i.fecha_fin_periodo) BETWEEN 2022 AND 2025`);
  await c.rollback();}finally{c.release();await pool.end();}
 const tiene=new Set(informes.map(r=>r.empresa_id+'|'+r.y)),res={generatedAt:new Date().toISOString(),source:'MYSQL_SOLO_LECTURA + SEC submissions (bulk local)',universo:empresas.length,porAnio:{}};
 const cand=candFile?fs.createWriteStream(candFile):null,cikEmpresas=new Map();
 for(const e of empresas){const tickers=String(e.tickers??'').split(',').filter(Boolean),ciks=new Set(tickers.flatMap(t=>[...(porTicker.get(t)??[])]));e.ciks=[...ciks];for(const k of ciks)(cikEmpresas.get(k)??cikEmpresas.set(k,[]).get(k)).push(e.id);}
 for(const y of YEARS){const a=(res.porAnio[y]={conInforme:0,sinInforme:0,causas:{}});
  for(const e of empresas){if(tiene.has(e.id+'|'+y)){a.conInforme++;continue;}a.sinInforme++;let causa;
   if(!e.ciks.length)causa='SIN_CIK';else if(e.ciks.length>1)causa='CIK_AMBIGUO';
   else{const info=porCik.get(e.ciks[0]),f=info.anuales.filter(x=>String(x.reportDate).slice(0,4)===String(y));
    if(f.length){const orig=f.find(x=>!x.form.endsWith('/A'))??f[0];causa='ANUAL_DISPONIBLE:'+orig.form;if(cikEmpresas.get(e.ciks[0]).length>1)causa+=':CIK_COMPARTIDO';cand?.write(JSON.stringify({empresa_id:e.id,cik:info.cik,year:y,form:orig.form,accn:orig.accn,reportDate:orig.reportDate,filingDate:orig.filingDate,shared:cikEmpresas.get(e.ciks[0]).length>1})+'\n');}
    else causa='SIN_ANUAL_'+(info.entityType||'desconocido')+(info.anuales.length?'_CON_ANUALES_OTROS_AÑOS':'_NUNCA_ANUAL');}
   a.causas[causa]=(a.causas[causa]??0)+1;}}
 if(cand)await new Promise(r=>cand.end(r));
 fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify(res,null,2));return res;
}
if(require.main===module){const a=process.argv.slice(2),i=a.indexOf('--candidatos'),cf=i>=0?path.resolve(a.splice(i,2)[1]):null;
 main(path.resolve(a[0]),path.resolve(a[1]??path.join(__dirname,'../coverage/ausencias_us.json')),cf).then(r=>{for(const[y,d]of Object.entries(r.porAnio))console.log(y,'con',d.conInforme,'sin',d.sinInforme,JSON.stringify(Object.entries(d.causas).sort((x,z)=>z[1]-x[1]).slice(0,8)));}).catch(e=>{console.error(e.stack);process.exitCode=1;});}
