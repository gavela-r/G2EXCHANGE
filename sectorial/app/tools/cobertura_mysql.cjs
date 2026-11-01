// Cobertura PCV/KPI 2022-2025 por país (US, JP, TW) y ejercicio. MySQL SÓLO LECTURA (START TRANSACTION READ ONLY).
// Universo congelado: todas las empresas del país en el momento de la consulta (lista ordenada + sha256). Denominador =
// universo × 17 conceptos núcleo (mismos CORE y KPI que server/scripts/auditar-pcv-kpi-2022-2025.cjs). No se excluye
// ninguna empresa por falta de datos; las exclusiones por no aplicabilidad (no implementadas) se contarían aparte.
// Celda certificada = existe PCV no nulo + prueba INSERTED/NULL_FILLED/VERIFIED_EXISTING y NO hay CONFLICT_PRESERVED
// (misma precedencia que adapter.cjs). KPI certificado = todas sus entradas certificadas en el mismo informe y sin
// división por cero; un cálculo con entradas no certificadas nunca cuenta.
// Uso: G2_PROJECT_ROOT=<proyecto con .env> node tools/cobertura_mysql.cjs [salida.json]
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const{database}=require('../runtime.cjs'),{KPIS:TODOS}=require('../kpi.cjs'),{MAP,perimeter}=require('../adapter.cjs');
const {noEsBeneficioNeto}=require(path.resolve(__dirname,'../../../server/dist/src/pcv/seleccionObservaciones'));
const CORE=['INGRESOS','BENEFICIO_BRUTO','EBIT','BENEFICIO_NETO','GASTO_INTERESES','EFECTIVO','ACTIVOS_TOTALES','PASIVOS_TOTALES','PATRIMONIO_NETO','DEUDA_CORTO_PLAZO','DEUDA_LARGO_PLAZO','FLUJO_CAJA_OPERATIVO','CAPEX','DEPRECIACION_AMORTIZACION','INVENTARIOS','CUENTAS_COBRAR','CUENTAS_PAGAR'];
// La cobertura KPI oficial usa los 17 KPI históricos (sin `method`). Los indicadores de días de circulante (DSO, DPO,
// DIO, CCC, con `method`) y ΔNWC se miden APARTE (derivedIndicators): no cambian la métrica comparada entre entregas.
const KPIS=TODOS.filter(k=>!k.method),DERIVADOS=TODOS.filter(k=>k.method),EXTRA=['COSTE_VENTAS','ACTIVOS_CONTRACTUALES'],CONCEPTOS=[...CORE,...EXTRA];
const YEARS=[2022,2023,2024,2025],COUNTRIES=['US','JP','TW'],CERT=['INSERTED','NULL_FILLED','VERIFIED_EXISTING'];
// Sólo informes de la fuente del país. Hay documentos EDINET (Japón) asignados a empresas de Taiwán por colisión de
// código bursátil («identidad cruzada», DATABASE.md §5): no son informes de esas empresas y no se eligen.
const FUENTES_PAIS={US:['SEC_EDGAR'],JP:['EDINET'],TW:['FINMIND','MOPS']};
// --ledger <ndjson>: registro de correcciones (tools/diagnostico_conflictos.cjs). Se mide APARTE como escenario
// «tras corregir» (simulado, no persistido): la cobertura oficial no cambia.
const LEDGER=(()=>{const i=process.argv.indexOf('--ledger');if(i<0)return null;const file=process.argv.splice(i,2)[1],m=new Map();for(const l of fs.readFileSync(file,'utf8').split(String.fromCharCode(10)))if(l.trim()){const r=JSON.parse(l);m.set(r.informe_id+'|'+r.concept,r.rule);}return{file,cells:m};})();
const codeOf=Object.fromEntries(Object.entries(MAP).map(([c,f])=>[f,c])),pct=(n,d)=>d?Number((100*n/d).toFixed(2)):null;
async function main(out){
 const pool=database(),conn=await pool.getConnection();
 try{
  await conn.query('SET SESSION MAX_EXECUTION_TIME=180000');await conn.query('START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY');
  const q=async(sql,params=[])=>{if(!/^\s*(SELECT|WITH)\b/i.test(sql))throw Error('Sólo SELECT');return(await conn.query({sql,timeout:200000},params))[0];};
  const[[meta]]=await conn.query('SELECT UTC_TIMESTAMP(6) at,DATABASE() db');const matrix=[],universe={};
  for(const country of COUNTRIES){
   const ids=(await q('SELECT e.id FROM empresa e JOIN pais p ON p.id=e.pais_id WHERE p.codigo_iso=? ORDER BY e.id',[country])).map(r=>Number(r.id));
   universe[country]={companies:ids.length,sha256:crypto.createHash('sha256').update(ids.join(',')).digest('hex')};
   const years=new Map(),nwcYears=new Map();
   for(const year of YEARS){
    const reports=await q(`WITH ranked AS (SELECT inf.id informe_id,inf.empresa_id,ROW_NUMBER() OVER(PARTITION BY inf.empresa_id ORDER BY inf.fecha_fin_periodo DESC,inf.fecha_publicacion DESC,inf.id DESC) rn FROM informe_financiero inf JOIN empresa e ON e.id=inf.empresa_id JOIN pais p ON p.id=e.pais_id WHERE p.codigo_iso=? AND inf.tipo_periodo='ANUAL' AND inf.fuente IN (?) AND YEAR(inf.fecha_fin_periodo)=?) SELECT informe_id,empresa_id FROM ranked WHERE rn=1`,[country,FUENTES_PAIS[country],year]);
    const tags=new Map(),reportIds=reports.map(r=>Number(r.informe_id)),key=(i,c)=>i+'|'+c,present=new Set(),cert=new Set(),conflict=new Set(),resolved=new Set(),reportsWithPcv=new Set();
    for(let k=0;k<reportIds.length;k+=2000){const chunk=reportIds.slice(k,k+2000);if(!chunk.length)continue;
     // Perímetro de beneficio y patrimonio (como kpi.cjs): ROE sólo con perímetros conocidos e iguales.
     for(const r of await q(`SELECT DISTINCT p.informe_id,t.concepto_estandar c,p.concepto tag FROM partida_contable_valor p JOIN taxonomia_concepto t ON t.id=p.concepto_estandar_id WHERE p.informe_id IN (?) AND p.importe IS NOT NULL AND t.concepto_estandar IN ('BENEFICIO_NETO','PATRIMONIO_NETO')`,[chunk])){if(noEsBeneficioNeto({concepto_estandar:r.c,concepto:r.tag}))continue;const k=key(r.informe_id,r.c);(tags.get(k)??tags.set(k,new Set()).get(k)).add(perimeter(r.c,r.tag));}
     for(const r of await q(`SELECT DISTINCT p.informe_id,t.concepto_estandar c FROM partida_contable_valor p JOIN taxonomia_concepto t ON t.id=p.concepto_estandar_id WHERE p.informe_id IN (?) AND p.importe IS NOT NULL AND t.concepto_estandar IN (?)`,[chunk,CONCEPTOS])){present.add(key(r.informe_id,r.c));reportsWithPcv.add(Number(r.informe_id));}
     for(const r of await q(`SELECT DISTINCT informe_id,concept_code c,outcome FROM pcv_verification_evidence WHERE informe_id IN (?) AND concept_code IN (?) AND outcome IN (?)`,[chunk,CONCEPTOS,CERT]))cert.add(key(r.informe_id,r.c));
     // Un conflicto deja de bloquear sólo si TODOS los CONFLICT_PRESERVED de la celda tienen un CONFLICT_RESOLVED de una
     // regla versionada que los referencia (resolves = evidence_hash, migración 31). La certificación sigue exigiendo una
     // prueba certificadora (cert).
     for(const r of await q(`SELECT c.informe_id,c.concept_code c,COUNT(*) n,SUM(EXISTS(SELECT 1 FROM pcv_verification_evidence x WHERE x.informe_id=c.informe_id AND x.concept_code=c.concept_code AND x.outcome='CONFLICT_RESOLVED' AND JSON_UNQUOTE(JSON_EXTRACT(x.evidence_json,'$.resolves'))=c.evidence_hash AND JSON_UNQUOTE(JSON_EXTRACT(x.evidence_json,'$.correction.rule')) IN ('JP_EFECTIVO_EQUIVALENTES_V1','US_PERIODO_V1','JP_RESUMEN_MISMO_DOC_V1','JP_SIGNO_CANONICO_V1'))) resueltos FROM pcv_verification_evidence c WHERE c.informe_id IN (?) AND c.concept_code IN (?) AND c.outcome='CONFLICT_PRESERVED' GROUP BY c.informe_id,c.concept_code`,[chunk,CONCEPTOS]))if(Number(r.resueltos)<Number(r.n))conflict.add(key(r.informe_id,r.c));else resolved.add(key(r.informe_id,r.c));}
    const byConcept=Object.fromEntries(CORE.map(c=>[c,{present:0,certified:0,conflict:0,presentUnverified:0,absentInReport:0}]));let presentN=0,certN=0,conflictN=0,unverified=0,absentInReport=0,companiesComplete=0;
    const kpi={expected:ids.length*KPIS.length,certified:0,blockedByInputs:0,noReport:(ids.length-reports.length)*KPIS.length,byKpi:Object.fromEntries(KPIS.map(k=>[k.code,0]))};
    const der=Object.fromEntries([...DERIVADOS.map(k=>k.code),'CAPITAL_CIRCULANTE_OPERATIVO'].map(c=>[c,0])),nwcCompanies=new Set(),empresaDe=new Map(reports.map(r=>[Number(r.informe_id),Number(r.empresa_id)]));
    const corr={pcv:0,kpi:0,byRule:{}},corregida=k=>LEDGER?.cells.has(k)&&conflict.has(k)&&present.has(k);
    for(const id of reportIds){let all=true;const certified=c=>present.has(key(id,c))&&cert.has(key(id,c))&&!conflict.has(key(id,c));
     const trasCorregir=c=>certified(c)||corregida(key(id,c));
     for(const c of CORE){const k=key(id,c);if(certified(c))corr.pcv++;else if(corregida(k)){corr.pcv++;const r=LEDGER.cells.get(k);corr.byRule[r]=(corr.byRule[r]??0)+1;}}
     for(const k of KPIS)if(k.inputs.every(f=>trasCorregir(codeOf[f])))corr.kpi++;
     for(const c of CORE){const s=byConcept[c],k=key(id,c);if(present.has(k)){presentN++;s.present++;if(conflict.has(k)){conflictN++;s.conflict++;all=false;}else if(cert.has(k)){certN++;s.certified++;}else{unverified++;s.presentUnverified++;all=false;}}else{absentInReport++;s.absentInReport++;all=false;}}
     if(all)companiesComplete++;
     const per=c=>{const s=tags.get(key(id,c));return s&&s.size===1?[...s][0]:null;},roeOk=per('BENEFICIO_NETO')&&per('BENEFICIO_NETO')===per('PATRIMONIO_NETO');
     for(const k of KPIS){if(k.inputs.every(f=>certified(codeOf[f]))&&(k.code!=='ROE'||roeOk)){kpi.certified++;kpi.byKpi[k.code]++;}else kpi.blockedByInputs++;}
     // Coste de ventas: declarado o derivado como ingresos − beneficio bruto (misma regla que adapter.cjs).
     const certDer=f=>f==='cogs'?certified('COSTE_VENTAS')||(certified('INGRESOS')&&certified('BENEFICIO_BRUTO')):certified(codeOf[f]);
     for(const k of DERIVADOS)if(k.inputs.every(certDer))der[k.code]++;
     if(['inventory','receivables','payables'].every(certDer)){der.CAPITAL_CIRCULANTE_OPERATIVO++;nwcCompanies.add(empresaDe.get(id));}}
    const expected=ids.length*CORE.length,noReport=(ids.length-reports.length)*CORE.length;
    years.set(year,new Set(reports.map(r=>Number(r.empresa_id))));nwcYears.set(year,nwcCompanies);
    // ΔNWC: NWC certificado en el año y en el anterior (cota superior: no comprueba aquí moneda/base entre cierres).
    const prevNwc=nwcYears.get(year-1),deltaNwc=prevNwc?[...nwcCompanies].filter(e=>prevNwc.has(e)).length:null;
    const derivedIndicators={nature:'DERIVADO_DE_PCV_CERTIFICADOS_NO_PERSISTIDO',expected:ids.length,byIndicator:Object.fromEntries(Object.entries(der).map(([c,n])=>[c,{certified:n,coverage:pct(n,ids.length)}])),DELTA_NWC:{certifiedUpperBound:deltaNwc,coverage:deltaNwc===null?null:pct(deltaNwc,ids.length),note:deltaNwc===null?'2022 sin saldo inicial de 2021 en la ventana':'cota superior'}};
    matrix.push({country,year,companies:ids.length,companiesWithReport:reports.length,companiesWithPcv:reportsWithPcv.size,companiesAllCoreCertified:companiesComplete,pcv:{expected,present:presentN,certified:certN,conflict:conflictN,presentUnverified:unverified,absent:expected-presentN,absentNoReport:noReport,absentInReport,notApplicable:0,grossCoverage:pct(presentN,expected),certifiedCoverage:pct(certN,expected),certifiedOfPresent:pct(certN,presentN)},kpi:{...kpi,certifiedCoverage:pct(kpi.certified,kpi.expected)},derivedIndicators,...(LEDGER?{afterCorrections:{nature:'SIMULADO_NO_PERSISTIDO',pcvCertified:corr.pcv,pcvCoverage:pct(corr.pcv,expected),kpiCertified:corr.kpi,kpiCoverage:pct(corr.kpi,kpi.expected),cellsByRule:corr.byRule}}:{}),byConcept:Object.fromEntries(Object.entries(byConcept).map(([c,s])=>[c,{...s,certifiedCoverage:pct(s.certified,ids.length)}]))});
    console.error(country,year,'pcv',pct(certN,expected),'kpi',pct(kpi.certified,kpi.expected));
   }
   const four=[...years.get(2022)].filter(id=>YEARS.every(y=>years.get(y).has(id))).length;for(const row of matrix.filter(r=>r.country===country))row.companiesWithFourYears=four;
  }
  await conn.rollback();
  const result={generatedAt:new Date().toISOString(),source:'MYSQL_SOLO_LECTURA',database:meta.db,snapshotAt:meta.at,definition:{core:CORE,kpis:KPIS.map(k=>({code:k.code,inputs:k.inputs.map(f=>codeOf[f])})),derivedIndicators:DERIVADOS.map(k=>({code:k.code,method:k.method,inputs:k.inputs.map(f=>codeOf[f])})),certifiedOutcomes:CERT,conflictPrecedence:'CONFLICT_PRESERVED',report:'último informe ANUAL por empresa y año de cierre, de la fuente del país',sourcesByCountry:FUENTES_PAIS,ledger:LEDGER?LEDGER.file:null,universe:'todas las empresas del país (sin exclusiones)',notApplicable:'no se aplican exclusiones (0)',target:{minimum:85,excellent:90}},universe,matrix};
  fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify(result,null,2));return result;
 }finally{conn.release();await pool.end();}
}
if(require.main===module)main(path.resolve(process.argv[2]??path.join(__dirname,'../coverage/cobertura_actual.json'))).then(r=>{for(const m of r.matrix)console.log([m.country,m.year,'univ',m.companies,'inf',m.companiesWithReport,'PCV bruta',m.pcv.grossCoverage+'%','cert',m.pcv.certifiedCoverage+'%','confl',m.pcv.conflict,'sinVerif',m.pcv.presentUnverified,'KPI cert',m.kpi.certifiedCoverage+'%',...(m.afterCorrections?['| tras correcciones PCV',m.afterCorrections.pcvCoverage+'%','KPI',m.afterCorrections.kpiCoverage+'%']:[])].join(' '));}).catch(e=>{console.error(e.message);process.exitCode=1;});
module.exports={main,CORE};
