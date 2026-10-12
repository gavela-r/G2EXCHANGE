const fs=require('node:fs'),path=require('node:path');
const pool=require('../dist/conexion/bd').default,{MAPEO_SECTORES}=require('../dist/src/valoracion/mapeoSectores');
const root=path.resolve(__dirname,'../..');
(async()=>{const summary={counts:{},eligibility:{},classification:{},originals_unchanged:{}};
 for(const t of ['empresa','instrumento','valuation_input_version','valuation_input_snapshot','valuation_run','valuation_run_resultado','valuation_execution','classification_evidence'])summary.counts[t]=(await pool.query('SELECT COUNT(*) n FROM '+t))[0][0].n;
 for(const [key,dir] of [['initial','tercera-inicial'],['rating_policy','tercera-mejorada'],['final','tercera-sec-final']]){
 const file=path.join(root,'server/resultados_valoraciones',dir,'incidencias.jsonl');if(!fs.existsSync(file))continue;
 const progress=JSON.parse(fs.readFileSync(path.join(path.dirname(file),'progreso.json')));const reasons={};for(const line of fs.readFileSync(file,'utf8').trim().split('\n')){const row=JSON.parse(line);if(row.code)reasons[row.code]=(reasons[row.code]||0)+1;}
 summary.eligibility[key]={...progress,reasons};}
 const [companies]=await pool.query(`SELECT e.id,e.sector_id,s.nombre_sector,c.sector_id evidence_sector,c.status,c.confidence FROM empresa e JOIN sector s ON s.id=e.sector_id LEFT JOIN (SELECT x.*,ROW_NUMBER() OVER(PARTITION BY empresa_id ORDER BY reference_date DESC,id DESC) rn FROM classification_evidence x WHERE reference_date<='2026-10-12') c ON c.empresa_id=e.id AND c.rn=1`);
 let original=0,effective=0,accepted=0,newlyResolved=0;for(const r of companies){const m=MAPEO_SECTORES[r.sector_id];const before=m&&m.clasificacion!=='REVISAR'&&m.nombre===r.nombre_sector;original+=!!before;let good=!!before;if(r.status==='ACCEPTED'&&r.confidence==='HIGH'){accepted++;const resolved=MAPEO_SECTORES[r.evidence_sector];good=!!resolved&&resolved.clasificacion!=='REVISAR';if(good&&!before)newlyResolved++;}effective+=good;}
 summary.classification={total:companies.length,original_usable:original,effective_usable:effective,newly_resolved:newlyResolved,evidence_accepted:accepted,pending:companies.length-effective,usable_percentage:100*effective/companies.length};
 summary.results=(await pool.query('SELECT validation_status,COUNT(*) scenarios,COUNT(DISTINCT valuation_run_id) valuations FROM valuation_run_resultado GROUP BY validation_status'))[0];
 const baseline=JSON.parse(fs.readFileSync(path.join(root,'private_backups/activacion-ensayo.json'))).original_checksums;for(const t of ['empresa','instrumento','informe_financiero','partida_contable_valor','kpi_financiero_informe','valuation_input_version','pais','sector','rating_sintetico','cotizacion_diaria']){const value=(await pool.query('CHECKSUM TABLE '+t))[0][0].Checksum;summary.originals_unchanged[t]=value===baseline[t];}
 fs.writeFileSync(path.join(root,'private_backups/resumen-final.json'),JSON.stringify(summary,null,2));console.log(JSON.stringify(summary,null,2));
})().catch(e=>{console.error(e.message);process.exitCode=1;}).finally(()=>pool.end());
