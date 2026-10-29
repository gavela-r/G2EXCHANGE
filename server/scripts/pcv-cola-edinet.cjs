const transient=code=>/deadlock|lock wait|DB_TRANSITORIO|ECONNRESET|ETIMEDOUT/i.test(code||'');
function documentosPendientes(events,located){
 const failed=new Set(events.filter(e=>e.status==='PENDING'&&transient(e.code)).map(e=>e.company+'|'+e.doc)),seen=new Set(),out=[];
 for(const r of located){const key=r.company+'|'+r.doc;if(!failed.has(key)||seen.has(key)||!Number.isSafeInteger(r.company)||!/^S[A-Z0-9]{7}$/.test(r.doc||'')||!/^\d{4}-\d{2}-\d{2}$/.test(r.end||'')||!/^\d{4}-\d{2}-\d{2}$/.test(r.published||''))continue;seen.add(key);out.push({company:r.company,docId:r.doc,end:r.end,published:r.published,metadataEvidence:{published:r.published,metadataHash:r.metadataHash}});}
 return out;
}
module.exports={documentosPendientes,transient};
