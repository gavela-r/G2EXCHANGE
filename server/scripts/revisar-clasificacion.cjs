// Append a documented human review. Existing evidence and original sectors stay intact.
const fs=require('node:fs'),pool=require('../dist/conexion/bd').default;
const {huella,serializar}=require('../dist/src/valoracion/datos'),{cargarCalidad}=require('../dist/src/valoracion/rutas');
(async()=>{const file=process.argv[2];if(!file)throw new Error('Uso: revisar-clasificacion.cjs dictamen.json');const e=JSON.parse(fs.readFileSync(file));
 for(const key of ['source','source_identifier','criterion'])if(typeof e[key]!=='string'||!e[key].trim())throw new Error('Falta evidencia '+key);
 if(!Number.isSafeInteger(e.empresa_id)||!['ACCEPTED','PENDING','REJECTED'].includes(e.status)||!['HIGH','MEDIUM','LOW'].includes(e.confidence))throw new Error('Dictamen inválido');
 cargarCalidad().fechaCivil(e.reference_date);if(e.status==='ACCEPTED'&&!Number.isSafeInteger(e.sector_id))throw new Error('Aceptación requiere sector');
 const hash=huella(e),[old]=await pool.query('SELECT id FROM classification_evidence WHERE evidence_hash=?',[hash]);await pool.query(`INSERT INTO classification_evidence(empresa_id,sector_id,source,reference_date,source_identifier,criterion,confidence,status,evidence_hash,evidence_json) VALUES(?,?,?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE evidence_hash=classification_evidence.evidence_hash`,[e.empresa_id,e.sector_id??null,e.source,e.reference_date,e.source_identifier,e.criterion,e.confidence,e.status,hash,serializar(e)]);console.log(JSON.stringify({inserted:old.length?0:1}));
})().catch(e=>{console.error(e.message);process.exitCode=1;}).finally(()=>pool.end());
