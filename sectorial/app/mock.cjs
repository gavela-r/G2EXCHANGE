// Fuente de datos MOCK para desarrollar el frontend sin MySQL. Sólo datos SINTÉTICOS rotulados (source QA_SINTETICO_ARNES):
//  -1..-16  expediente completo por sector (calcula los tres escenarios con la configuración de /examples/:sector)
//  -101     clasificación sin resolver (sector N/A)       -102  histórico conflictivo        -103  conceptos ausentes
// La fecha de valoración de los mocks es fija (2026-03-31), con independencia del asOf solicitado.
const path=require('node:path'),{pathToFileURL}=require('node:url'),crypto=require('node:crypto');
async function createMockSource(){
 const qa=await import(pathToFileURL(path.join(__dirname,'tests/qa_fixtures.mjs')).href),{models}=require('./registry.cjs');
 const rehash=s=>{s.inputHash=qa.sha({asOf:s.asOf,company:s.company,classification:s.classification,periods:s.periods,issues:s.issues});return s;};
 const byId=new Map();
 for(const m of models){const{snapshot}=qa.snapshotFor(m.id);byId.set(snapshot.company.id,snapshot);}
 const base=()=>structuredClone(qa.snapshotFor(16).snapshot);
 const unresolved=base();unresolved.company={...unresolved.company,id:-101,nombre_empresa:'QA SINTÉTICO — CLASIFICACIÓN SIN RESOLVER (no es empresa)',nombre_sector:'N/A'};unresolved.classification={sectorId:221,sectorName:'N/A',model:null,status:'BLOQUEADO',method:'REVISAR',evidence:null,reason:'Clasificación pendiente, contradictoria o sin mapeo acreditado'};byId.set(-101,rehash(unresolved));
 const conflict=base();conflict.company={...conflict.company,id:-102,nombre_empresa:'QA SINTÉTICO — HISTÓRICO CONFLICTIVO (no es empresa)'};for(const k of['revenue','cash'])conflict.periods[2].fields[k]={...conflict.periods[2].fields[k],value:null,validation:'CONFLICTIVO',reason:'Importe heredado difiere del candidato oficial; conflicto conservado'};byId.set(-102,rehash(conflict));
 const missing=base();missing.company={...missing.company,id:-103,nombre_empresa:'QA SINTÉTICO — CONCEPTOS AUSENTES (no es empresa)'};for(const p of missing.periods)for(const k of['inventory','receivables','payables'])p.fields[k]={value:null,validation:'PENDIENTE',code:k,reason:'Concepto ausente',recordIds:[]};byId.set(-103,rehash(missing));
 const list=[...byId.values()].map(s=>({id:s.company.id,nombre_empresa:s.company.nombre_empresa,sector_id:s.company.sector_id,nombre_sector:s.company.nombre_sector,codigo_iso:s.company.codigo_iso,ticker:'QA'+String(Math.abs(s.company.id)).padStart(3,'0')}));
 return{mode:'MOCK_SINTETICO',
  search:async q=>{const t=String(q).toLowerCase();return list.filter(c=>!t||c.nombre_empresa.toLowerCase().includes(t)||c.ticker.toLowerCase().startsWith(t)||String(c.nombre_sector).toLowerCase().includes(t));},
  load:async id=>{const s=byId.get(id);if(!s){const e=new Error('Empresa mock inexistente');e.code='ENOENT';throw e;}return structuredClone(s);},
  example:async sector=>{const{config,snapshot}=qa.buildCase(sector);return{companyId:snapshot.company.id,asOf:snapshot.asOf,configuration:config,note:'Configuración QA sintética completa: enviar como {asOf, configuration} a POST /api/sectorial/companies/'+snapshot.company.id+'/evaluate'};}
 };
}
module.exports={createMockSource};
