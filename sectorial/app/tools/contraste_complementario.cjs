// Contraste de los PCV de MySQL (SÓLO LECTURA) con proveedores complementarios descargados en local:
//  --jquants <dir>    J-Quants V2 /fins/summary (JP; resúmenes anuales consolidados, yenes exactos)
//  --eulerpool <dir>  Eulerpool (TW; estados estandarizados en millones, tolerancia de redondeo)
// Resultado por país y ejercicio: celdas comparables, coincidencias y discrepancias según el estado de certificación
// del PCV (CERTIFICADO / CONFLICTIVO / PENDIENTE). Es CORROBORACIÓN: no certifica nada (la certificación sigue
// exigiendo la fuente primaria) y no se escribe en MySQL. Los importes de terceros no se copian a la salida.
// Uso: G2_PROJECT_ROOT=<proyecto> node tools/contraste_complementario.cjs --jquants <dir> --eulerpool <dir> [salida.json]
const fs=require('node:fs'),path=require('node:path');
const{database}=require('../runtime.cjs');
// Conectores compilados de este mismo repositorio (npm --prefix server run build).
const conectores=require(path.resolve(__dirname,'../../../server/dist/src/proveedores/conectores'));
// Sólo informes de la fuente del país: hay documentos EDINET (Japón) asignados por colisión de código bursátil a
// empresas de Taiwán (ver PCV_KPI_STATUS.md, «identidad cruzada»); nunca se usan para una empresa taiwanesa.
const FUENTES_PAIS={US:['SEC_EDGAR'],JP:['EDINET'],TW:['FINMIND','MOPS']};
const YEARS=[2022,2023,2024,2025],CERT=['INSERTED','NULL_FILLED','VERIFIED_EXISTING'];
const arg=(k)=>{const i=process.argv.indexOf(k);return i>=0?process.argv.splice(i,2)[1]:null;};

function cargarJQuants(dir){
 const m=new Map();if(!dir)return m;
 for(const f of fs.readdirSync(path.join(dir,'raw')).filter(f=>f.endsWith('.json')))for(const fila of JSON.parse(fs.readFileSync(path.join(dir,'raw',f),'utf8'))){
  const a=conectores.anualConsolidadoJQuants(fila);if(!a)continue;
  // Última publicación por empresa y cierre (las correcciones llevan un DiscNo nuevo y no sobrescriben la anterior).
  const k=a.code.slice(0,4)+'|'+a.fin,prev=m.get(k);if(!prev||a.disc+a.discNo>prev.disc+prev.discNo)m.set(k,a);}
 const out=new Map();for(const[k,a]of m)for(const[c,v]of Object.entries(a.valores))out.set(k+'|'+c,{valor:v,exacto:true,fuente:'JQUANTS_FINS_SUMMARY',doc:a.discNo,norma:a.norma});return out;
}
function cargarEulerpool(dir){
 const out=new Map();if(!dir)return out;const ck=JSON.parse(fs.readFileSync(path.join(dir,'checkpoint.json'),'utf8'));
 for(const[k,info]of Object.entries(ck.done)){const ep=k.split('_').slice(1).join('_');for(const r of conectores.filasEulerpool(ep,JSON.parse(fs.readFileSync(path.join(dir,'raw',k+'.json'),'utf8'))))out.set(info.ticker+'|'+r.fin+'|'+r.codigo,{valor:r.importe,exacto:false,fuente:'EULERPOOL',doc:null});}
 return out;
}
const TRIMESTRALES=new Set(['INGRESOS','BENEFICIO_BRUTO','EBIT','BENEFICIO_NETO']);
const coincide=(a,b,exacto)=>exacto?a===b:Math.abs(a-b)<=Math.max(0.5e6,Math.abs(b)*0.0005);

const OPCIONES={jquants:arg('--jquants'),eulerpool:arg('--eulerpool')};
async function main(out){
 const fuentes={JP:cargarJQuants(OPCIONES.jquants),TW:cargarEulerpool(OPCIONES.eulerpool)};
 const pool=database(),conn=await pool.getConnection(),result={generatedAt:new Date().toISOString(),source:'MYSQL_SOLO_LECTURA',nature:'CORROBORACION_NO_CERTIFICA',countries:{}};
 try{
  await conn.query('SET SESSION MAX_EXECUTION_TIME=600000');await conn.query('START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY');
  const q=async(sql,p=[])=>{if(!/^\s*(SELECT|WITH)\b/i.test(sql))throw Error('Sólo SELECT');return(await conn.query({sql,timeout:600000},p))[0];};
  for(const[country,datos]of Object.entries(fuentes)){
   if(!datos.size)continue;
   const tickers=[...new Set([...datos.keys()].map(k=>k.split('|')[0]))];
   const informes=await q(`WITH r AS (SELECT inf.id,inf.empresa_id,DATE_FORMAT(inf.fecha_fin_periodo,'%Y-%m-%d') fin,YEAR(inf.fecha_fin_periodo) y,MIN(ins.ticker) ticker,ROW_NUMBER() OVER(PARTITION BY inf.empresa_id,YEAR(inf.fecha_fin_periodo) ORDER BY inf.fecha_fin_periodo DESC,inf.fecha_publicacion DESC,inf.id DESC) rn
     FROM informe_financiero inf JOIN empresa e ON e.id=inf.empresa_id JOIN pais p ON p.id=e.pais_id JOIN instrumento ins ON ins.empresa_id=e.id
     WHERE p.codigo_iso=? AND inf.tipo_periodo='ANUAL' AND inf.fuente IN (?) AND YEAR(inf.fecha_fin_periodo) BETWEEN 2022 AND 2025 AND ins.ticker IN (?) GROUP BY inf.id,inf.empresa_id,inf.fecha_fin_periodo,inf.fecha_publicacion) SELECT * FROM r WHERE rn=1`,[country,FUENTES_PAIS[country],tickers]);
   const ids=informes.map(r=>r.id),pcv=new Map(),estado=new Map();
   for(let k=0;k<ids.length;k+=2000){const ch=ids.slice(k,k+2000);
    for(const r of await q(`SELECT p.informe_id,t.concepto_estandar c,p.importe FROM partida_contable_valor p JOIN taxonomia_concepto t ON t.id=p.concepto_estandar_id WHERE p.informe_id IN (?) AND p.importe IS NOT NULL`,[ch]))(pcv.get(r.informe_id+'|'+r.c)??pcv.set(r.informe_id+'|'+r.c,[]).get(r.informe_id+'|'+r.c)).push(Number(r.importe));
    for(const r of await q(`SELECT DISTINCT informe_id,concept_code c,outcome FROM pcv_verification_evidence WHERE informe_id IN (?) AND outcome IN (?)`,[ch,[...CERT,'CONFLICT_PRESERVED']])){const k2=r.informe_id+'|'+r.c;if(r.outcome==='CONFLICT_PRESERVED')estado.set(k2,'CONFLICTIVO');else if(estado.get(k2)!=='CONFLICTIVO')estado.set(k2,'CERTIFICADO');}}
   const porAnio={},empresas=new Set();
   for(const inf of informes){
    const y=(porAnio[inf.y]??={informes:0,comparables:0,coinciden:0,discrepan:0,soloProveedor:0,porEstado:{},porConcepto:{}});y.informes++;
    for(const[k,v]of datos){const[t,fin,c]=k.split('|');if(t!==inf.ticker||fin!==inf.fin)continue;empresas.add(t);
     const valores=pcv.get(inf.id+'|'+c);const st=estado.get(inf.id+'|'+c)??(valores?'PENDIENTE':'AUSENTE');
     if(!valores){y.soloProveedor++;continue;}
     const norm=x=>c==='CAPEX'||c==='DIVIDENDOS_PAGADOS'?Math.abs(x):x,ok=valores.some(x=>coincide(norm(x),v.valor,v.exacto));
     // J-Quants (決算短信) suele expresar el resumen en millones de yenes truncados: diferencia < 1 M se informa aparte.
     const redondeo=!ok&&v.exacto&&valores.some(x=>Math.abs(norm(x)-v.valor)<1e6);
     y.comparables++;ok?y.coinciden++:redondeo?(y.redondeoMillones=(y.redondeoMillones??0)+1):y.discrepan++;
     // Taiwán: resultados de FinMind guardados como trimestre aislado (finmindTrimestral.ts) → 15-45 % del anual.
     if(!ok&&country==='TW'&&TRIMESTRALES.has(c)&&v.valor>0){const r=valores[0]/v.valor;if(r>=0.15&&r<=0.45)y.trimestreComoAnual=(y.trimestreComoAnual??0)+1;if(TRIMESTRALES.has(c))y.resultadosComparables=(y.resultadosComparables??0)+1;}else if(country==='TW'&&TRIMESTRALES.has(c))y.resultadosComparables=(y.resultadosComparables??0)+1;
     const e=(y.porEstado[st]??={coinciden:0,redondeoMillones:0,discrepan:0});ok?e.coinciden++:redondeo?e.redondeoMillones++:e.discrepan++;
     const pc=(y.porConcepto[c]??={coinciden:0,redondeoMillones:0,discrepan:0});ok?pc.coinciden++:redondeo?pc.redondeoMillones++:pc.discrepan++;}
   }
   result.countries[country]={provider:country==='JP'?'JQUANTS_FINS_SUMMARY':'EULERPOOL',providerCells:datos.size,companiesMatched:empresas.size,tolerance:country==='JP'?'exacta (yenes)':'max(0,5 M; 0,05 %) por redondeo a millones',byYear:porAnio};
   console.error(country,'informes',informes.length,'empresas',empresas.size);
  }
  await conn.rollback();
 }finally{conn.release();await pool.end();}
 fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify(result,null,2));return result;
}
if(require.main===module)main(path.resolve(process.argv[2]??path.join(__dirname,'../coverage/contraste_complementario.json'))).then(r=>{for(const[c,v]of Object.entries(r.countries))for(const[y,d]of Object.entries(v.byYear))console.log(c,y,'informes',d.informes,'comparables',d.comparables,'coinciden',d.coinciden,'redondeo<1M',d.redondeoMillones??0,'discrepan',d.discrepan,...(d.resultadosComparables?['trimestre-como-anual',d.trimestreComoAnual??0,'de',d.resultadosComparables]:[]),JSON.stringify(d.porEstado));}).catch(e=>{console.error(e.stack);process.exitCode=1;});
