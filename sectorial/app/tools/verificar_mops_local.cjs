// Verificador de Taiwán con informes financieros MOPS (inline XBRL TIFRS) DESCARGADOS MANUALMENTE.
//
// Las condiciones de uso de TWSE (sección 6) prohíben descargar datos de su web con herramientas automatizadas sin
// consentimiento, y la Open Data de TWSE/TPEx sólo publica el último periodo. Por eso este verificador NO descarga:
// lee los archivos que una persona haya guardado desde MOPS en un directorio (nombre original, p. ej.
// tifrs-fr1-m1-ci-cr-2330-2022Q4.html) y un manifiesto opcional `manifest.json` con la fecha de publicación que muestra
// MOPS para cada archivo ({"tifrs-...html":{"publicationDate":"2023-03-07"}}).
//
// Comprobaciones (server/src/pcv/mopsAnualVerificado.ts): empresa (CompanyID + denominación oficial china del maestro
// Open Data de TWSE, licencia de datos abiertos), documento (nombre de archivo consolidado), ejercicio (cierre anual),
// concepto (tags ifrs-full/tifrs oficiales), moneda (TWD), escala (atributo scale), norma (TIFRS), perímetro
// (consolidado, sin dimensiones), importe; fecha de publicación sólo si el manifiesto la aporta.
// Después compara con los PCV de MySQL (SÓLO LECTURA) del informe ANUAL de la fuente del país (FINMIND/MOPS) y
// clasifica: COINCIDE_FUENTE_OFICIAL / DISCREPA / SIN_PCV / SIN_INFORME_TW. No escribe en MySQL.
// Uso: G2_PROJECT_ROOT=<proyecto> node tools/verificar_mops_local.cjs <dirArchivosMops> <maestroTwse.json> [salida.json]
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const{database}=require('../runtime.cjs');
const{extraerAnualMops}=require(path.resolve(__dirname,'../../../server/dist/src/pcv/mopsAnualVerificado'));
const NOMBRE=/^tifrs-[a-z0-9-]+-cr-(\d{4})-(202[2-5])Q4\.html$/;
const ABS=new Set(['CAPEX','DIVIDENDOS_PAGADOS']);

function leerDirectorio(dir,maestro){
 const nombres=new Map(maestro.map(r=>[String(r['公司代號']).trim(),String(r['公司名稱']).trim()]));
 let manifest={};try{manifest=JSON.parse(fs.readFileSync(path.join(dir,'manifest.json'),'utf8'));}catch{}
 const out=[];
 for(const f of fs.readdirSync(dir).sort()){const m=NOMBRE.exec(f);if(!m)continue;
  const bytes=fs.readFileSync(path.join(dir,f)),sha256=crypto.createHash('sha256').update(bytes).digest('hex'),stockId=m[1],year=Number(m[2]);
  const official=nombres.get(stockId),pub=manifest[f]?.publicationDate??null;
  if(!official){out.push({file:f,stockId,year,sha256,status:'EMPRESA_NO_EN_MAESTRO_OPEN_DATA'});continue;}
  try{const r=extraerAnualMops(bytes,{stockId,year,filename:f,basis:'consolidated',observedAt:fs.statSync(path.join(dir,f)).mtime.toISOString(),officialChineseName:official},f);
   out.push({file:f,stockId,year,sha256,status:'EXTRAIDO',standard:'TIFRS',currency:'TWD',basis:'consolidated',start:r.start,end:r.end,publicationDate:/^\d{4}-\d{2}-\d{2}$/.test(pub??'')?pub:null,publicationVerified:/^\d{4}-\d{2}-\d{2}$/.test(pub??''),rows:r.rows.map(x=>({code:x.codigo,tag:x.concepto,amount:x.importe,currency:x.currency})),pending:r.pending});}
  catch(e){out.push({file:f,stockId,year,sha256,status:'RECHAZADO',reason:e.message});}}
 return out;
}

async function main(dir,maestroFile,out){
 const docs=leerDirectorio(dir,JSON.parse(fs.readFileSync(maestroFile,'utf8')));
 const extraidos=docs.filter(d=>d.status==='EXTRAIDO'),result={generatedAt:new Date().toISOString(),source:'MOPS_ARCHIVOS_MANUALES',mysql:'SOLO_LECTURA',documents:docs.map(({rows,...d})=>({...d,rows:rows?.length??0})),comparison:[]};
 if(extraidos.length){
  const pool=database(),conn=await pool.getConnection();
  try{await conn.query('START TRANSACTION READ ONLY');
   for(const d of extraidos){
    const[inf]=(await conn.query(`SELECT inf.id FROM informe_financiero inf JOIN empresa e ON e.id=inf.empresa_id JOIN pais p ON p.id=e.pais_id JOIN instrumento ins ON ins.empresa_id=e.id WHERE p.codigo_iso='TW' AND ins.ticker=? AND inf.tipo_periodo='ANUAL' AND inf.fuente IN ('FINMIND','MOPS') AND inf.fecha_fin_periodo=? ORDER BY inf.fecha_publicacion DESC,inf.id DESC LIMIT 1`,[d.stockId,d.end]))[0];
    if(!inf){result.comparison.push({file:d.file,status:'SIN_INFORME_TW',cells:d.rows.length});continue;}
    const pcv=new Map();for(const r of(await conn.query(`SELECT t.concepto_estandar c,p.importe FROM partida_contable_valor p JOIN taxonomia_concepto t ON t.id=p.concepto_estandar_id WHERE p.informe_id=? AND p.importe IS NOT NULL`,[inf.id]))[0])(pcv.get(r.c)??pcv.set(r.c,[]).get(r.c)).push(Number(r.importe));
    const cells=d.rows.map(x=>{const v=pcv.get(x.code);if(!v)return{code:x.code,status:'SIN_PCV'};const ok=v.some(y=>(ABS.has(x.code)?Math.abs(y):y)===x.amount);return{code:x.code,status:ok?'COINCIDE_FUENTE_OFICIAL':'DISCREPA',ratio:ok?1:Number((v[0]/x.amount).toFixed(4))};});
    result.comparison.push({file:d.file,informe_id:inf.id,status:'COMPARADO',cells});}
   await conn.rollback();}finally{conn.release();await pool.end();}}
 fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify(result,null,2));return result;
}
module.exports={leerDirectorio};
if(require.main===module){const[dir,maestro,out]=process.argv.slice(2);if(!dir||!maestro){console.error('Uso: node tools/verificar_mops_local.cjs <dir> <maestroTwse.json> [salida.json]');process.exit(2);}
 main(path.resolve(dir),path.resolve(maestro),path.resolve(out??path.join(__dirname,'../coverage/verificacion_mops_local.json'))).then(r=>{for(const d of r.documents)console.log(d.file,d.status,d.reason??'',d.rows??'');for(const c of r.comparison)console.log(c.file,c.status,JSON.stringify(c.cells??c.cells));}).catch(e=>{console.error(e.message);process.exitCode=1;});}
