// Recover the original issuer identity from the exact input of the legacy CSV
// parser. No fuzzy prefix matching, company edits or reconstructed instruments.
const {parse}=require('csv-parse/sync'),cheerio=require('cheerio'),Z=require('adm-zip');
const norm=s=>String(s||'').normalize('NFKC').toUpperCase().replace(/[^\p{L}\p{N}]/gu,'');
function registroConPersonaJuridica(text){
 const rows=parse(text,{skip_empty_lines:true,relax_column_count:true,bom:true}),h=rows.findIndex(r=>r.map(x=>x.normalize('NFKC')).includes('EDINETコード'));if(h<0)throw Error('ORIGEN_EDINET_CABECERA');
 const header=rows[h].map(x=>x.normalize('NFKC')),idx=key=>{const i=header.indexOf(key);if(i<0)throw Error('ORIGEN_EDINET_COLUMNA_'+key);return i;};
 const c={code:idx('EDINETコード'),security:idx('証券コード'),english:idx('提出者名(英字)'),japanese:idx('提出者名'),jcn:idx('提出者法人番号')};
 return rows.slice(h+1).filter(r=>/^E\d{5}$/.test(r[c.code])).map(r=>({edinetCode:r[c.code],securityCode:r[c.security],englishName:r[c.english],japaneseName:r[c.japanese],jcn:r[c.jcn]}));
}
function reconstruirVinculos(companies,sourceText,currentText,{expectedCount=3581,expectedOffset=10432}={}){
 const sourceRows=registroConPersonaJuridica(sourceText),currentRows=registroConPersonaJuridica(currentText),original=new Map(sourceRows.map(r=>[r.edinetCode,r])),current=new Map(currentRows.map(r=>[r.edinetCode,r]));
 if(original.size!==sourceRows.length||current.size!==currentRows.length)throw Error('ORIGEN_EDINET_CODIGO_DUPLICADO');
 const legacy=sourceText.trim().split('\n').slice(2).map(line=>line.split(',').map(cell=>cell.replace(/^"|"$/g,'').trim())).filter(r=>r[2]==='上場'&&r[11]).map((r,ordinal)=>({ordinal,code:r[0],name:r[7]||'N/A'})),byName=new Map();
 for(const row of legacy)byName.set(row.name,[...(byName.get(row.name)||[]),row]);
 // The offset corroborates dataset lineage across every unambiguous row. It
 // NEVER selects among collisions or substitutes for an exact source name.
 if(companies.length!==expectedCount||companies.some(c=>!byName.has(c.nombre_empresa)))throw Error('ORIGEN_EDINET_UNIVERSO_NO_REPRODUCIDO');
 for(const c of companies){const rows=byName.get(c.nombre_empresa);if(rows.length===1&&c.id-rows[0].ordinal!==expectedOffset)throw Error('ORIGEN_EDINET_SECUENCIA_NO_REPRODUCIDA');}
 const bindings=new Map(),pending=[];
 for(const company of companies){const matches=byName.get(company.nombre_empresa);let reason=null;
  if(matches.length!==1||norm(company.nombre_empresa)==='NA')reason='LEGACY_SOURCE_NAME_COLLISION';
  const a=matches.length===1?original.get(matches[0].code):null,b=a?current.get(a.edinetCode):null;
  if(!reason&&(!a||!b||!/^\d{13}$/.test(a.jcn)||a.jcn!==b.jcn))reason='EDINET_CORPORATE_NUMBER_UNVERIFIED';
  if(!reason&&(!/^[A-Z0-9]{4}0$/.test(a.securityCode)||b.securityCode&&b.securityCode!==a.securityCode))reason='EDINET_SECURITY_CODE_CONFLICT';
  if(!reason&&company.tickers.length&&!company.tickers.some(t=>t===a.securityCode||t+'0'===a.securityCode))reason='DATABASE_INSTRUMENT_CONFLICT';
  if(!reason&&(!norm(a.englishName)||!norm(b.englishName)))reason='EDINET_FULL_NAME_MISSING';
  if(reason){pending.push({company:company.id,reason});continue;}
  if(bindings.has(a.edinetCode))throw Error('ORIGEN_EDINET_EMISOR_DUPLICADO');
  bindings.set(a.edinetCode,{company,registro:{...a,listed:!!b.securityCode,sector:''},criterion:'PINNED_LEGACY_INPUT_EXACT_ROW_STABLE_JCN_AND_DOCUMENT_FULL_NAME',originProof:{sourceOrdinal:matches[0].ordinal,lineageOffset:expectedOffset,edinetCode:a.edinetCode,jcn:a.jcn,securityCode:a.securityCode,sourceEnglishName:a.englishName,currentEnglishName:b.englishName,currentSecurityCode:b.securityCode,allowedEnglishNames:[...new Set([a.englishName,b.englishName])],documentFullNameRequired:true}});
 }
 return {bindings,pending,lineage:{companies:companies.length,exactOutputNames:companies.length,uniqueNames:companies.length-pending.filter(x=>x.reason==='LEGACY_SOURCE_NAME_COLLISION').length,offset:expectedOffset}};
}
function validarNombreLegalDocumento(bytes,binding){
 const entries=new Z(bytes).getEntries().filter(e=>/publicdoc\/[^/]+\.xbrl$/i.test(e.entryName));if(entries.length!==1||entries[0].header.size>128*1024**2)throw Error('ORIGEN_EDINET_DOCUMENTO_AMBIGUO');
 const $=cheerio.load(entries[0].getData().toString('utf8'),{xml:true}),nodes=$('*').toArray(),root=nodes.find(n=>(n.name||'').split(':').pop()==='xbrl');
 const names=[...new Set(nodes.filter(n=>{const [prefix,local]=(n.name||'').split(':');return local==='CompanyNameInEnglishCoverPage'&&/^https?:\/\/disclosure\.edinet-fsa\.go\.jp\/taxonomy\/jpcrp\/\d{4}-\d{2}-\d{2}\/jpcrp_cor$/.test(root?.attribs?.['xmlns:'+prefix]||'');}).map(n=>$(n).text().trim()))];
 if(names.length!==1||!binding.originProof.allowedEnglishNames.some(n=>norm(n)===norm(names[0])))throw Error('ORIGEN_EDINET_NOMBRE_COMPLETO_DOCUMENTO_NO_VERIFICADO');
 return {criterion:binding.criterion,documentEnglishName:names[0],...binding.originProof};
}
module.exports={registroConPersonaJuridica,reconstruirVinculos,validarNombreLegalDocumento};
