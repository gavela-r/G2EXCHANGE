// Clasifica una muestra de pcv_verification_evidence CONFLICT_PRESERVED por tipo de discrepancia (SÓLO LECTURA).
// Uso: G2_PROJECT_ROOT=<proyecto con .env> node tools/clasificar_conflictos.cjs [muestra_por_pais=4000] [salida.json]
const fs=require('node:fs'),path=require('node:path'),{database}=require('../runtime.cjs');
const N=Number(process.argv[2]??4000),out=path.resolve(process.argv[3]??path.join(__dirname,'../coverage/conflictos_muestra.json'));
const near=(a,b,t)=>Math.abs(a-b)<=t*Math.max(Math.abs(a),Math.abs(b),1);
function classify(candidate,originals){
 const c=Number(candidate?.importe),o=(originals??[]).map(x=>Number(x.importe??x.value)).filter(Number.isFinite);
 if(!Number.isFinite(c))return'CANDIDATO_SIN_IMPORTE';if(!o.length)return'ORIGINAL_SIN_IMPORTE';
 if(o.length>1&&new Set(o.map(v=>v.toFixed(6))).size>1)return'ORIGINALES_DUPLICADOS_DISTINTOS';
 const v=o[0];if(near(c,v,1e-9))return'IGUALES_PRECISION_NUMERICA';if(near(c,v,5e-4))return'REDONDEO_MENOR_0_05PCT';
 for(const[s,k]of[[1e3,'ESCALA_X1000'],[1e6,'ESCALA_X1E6'],[1e-3,'ESCALA_X0_001'],[1e-6,'ESCALA_X1E-6']])if(near(c,v*s,5e-4))return k;
 if(near(c,-v,5e-4))return'SIGNO_INVERTIDO';if(near(Math.abs(c),Math.abs(v)*1e3,5e-4)||near(Math.abs(c),Math.abs(v)/1e3,5e-4))return'ESCALA_Y_SIGNO';
 if(v===0||c===0)return'UNO_ES_CERO';return'VALOR_DISTINTO';
}
(async()=>{const pool=database(),conn=await pool.getConnection();try{await conn.query('SET SESSION MAX_EXECUTION_TIME=180000');await conn.query('START TRANSACTION READ ONLY');const result={generatedAt:new Date().toISOString(),sampleSizePerCountry:N,countries:{}};
 for(const country of['US','JP']){const[rows]=await conn.query({sql:`SELECT v.concept_code,v.provider,v.evidence_json FROM pcv_verification_evidence v JOIN informe_financiero i ON i.id=v.informe_id JOIN empresa e ON e.id=i.empresa_id JOIN pais p ON p.id=e.pais_id WHERE p.codigo_iso=? AND v.outcome='CONFLICT_PRESERVED' AND YEAR(i.fecha_fin_periodo) BETWEEN 2022 AND 2025 ORDER BY v.id DESC LIMIT ?`,timeout:200000},[country,N]);
  const byType={},byConcept={},examples={};for(const r of rows){const j=typeof r.evidence_json==='string'?JSON.parse(r.evidence_json):r.evidence_json,t=classify(j?.evidence?.candidate,j?.evidence?.originals);byType[t]=(byType[t]??0)+1;(byConcept[r.concept_code]??={})[t]=(byConcept[r.concept_code][t]??0)+1;if(!examples[t])examples[t]={concept:r.concept_code,provider:r.provider,candidate:j?.evidence?.candidate?.importe,candidateTag:j?.evidence?.candidate?.concepto,originals:(j?.evidence?.originals??[]).map(o=>({importe:o.importe??o.value,concepto:o.concepto}))};}
  result.countries[country]={sampled:rows.length,byType,byConcept,examples};console.log(country,rows.length,JSON.stringify(byType));}
 await conn.rollback();fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify(result,null,2));}finally{conn.release();await pool.end();}})().catch(e=>{console.error(e.message);process.exitCode=1;});
