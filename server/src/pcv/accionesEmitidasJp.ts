import AdmZip from 'adm-zip';
import * as cheerio from 'cheerio';
import {normalizarEdinetZip,numeroReportado,type InformePcv,type DatoPcv} from './normalizarProveedores';

// Issued shares describe the issuer's capital, even when its statements are
// consolidated. A standalone issuer context is valid for this one concept.
export function normalizarAccionesEmitidasJp(bytes:Buffer,report:InformePcv):DatoPcv[]{
 if(report.country!=='JP')throw Error('ACCIONES_JP_PAIS');
 const {identity}=normalizarEdinetZip(bytes,report);
 const entries=new AdmZip(bytes).getEntries().filter(e=>/publicdoc\/[^/]+\.xbrl$/i.test(e.entryName));
 if(entries.length!==1)throw Error('EDINET_XBRL_AMBIGUO');
 const $=cheerio.load(entries[0].getData().toString('utf8'),{xml:true}),nodes=$('*').toArray() as any[];
 const local=(name:string)=>name.split(':').pop()||'';
 const root=nodes.find(n=>local(n.name||'')==='xbrl');
 if(!/^https?:\/\/disclosure\.edinet-fsa\.go\.jp\/taxonomy\/jpcrp\/\d{4}-\d{2}-\d{2}\/jpcrp_cor$/.test(root?.attribs?.['xmlns:jpcrp_cor']||''))throw Error('ACCIONES_JP_NAMESPACE');
 const byId=new Map(nodes.filter(n=>n.attribs?.id).map(n=>[n.attribs.id,n]));
 const rows:DatoPcv[]=[];
 for(const node of nodes){
  if(node.name!=='jpcrp_cor:TotalNumberOfIssuedSharesSummaryOfBusinessResults'||node.attribs['xsi:nil']==='true')continue;
  const context=byId.get(node.attribs.contextRef),unit=byId.get(node.attribs.unitRef);if(!context||!unit)continue;
  const descendants=$(context).find('*').toArray() as any[],units=$(unit).find('*').toArray() as any[];
  const text=(name:string)=>descendants.filter(n=>local(n.name||'')===name).map(n=>$(n).text().trim());
  if(text('instant').length!==1||text('instant')[0]!==report.end||text('startDate').length)continue;
  const identifier=text('identifier');if(identifier.length!==1||!new RegExp('^'+identity.edinetCode+'(?:-\\d+)?$').test(identifier[0]))continue;
  if(descendants.some(n=>local(n.name||'')==='typedMember'))continue;
  const dimensions=descendants.filter(n=>local(n.name||'')==='explicitMember');
  if(dimensions.some(n=>local(n.attribs.dimension||'')!=='ConsolidatedOrNonConsolidatedAxis'||!['NonConsolidatedMember','ConsolidatedMember'].includes(local($(n).text().trim()))))continue;
  const measures=units.filter(n=>local(n.name||'')==='measure');
  if(measures.length!==1||local($(measures[0]).text().trim())!=='shares'||units.some(n=>local(n.name||'')==='divide'))continue;
  const value=numeroReportado($(node).text());if(value===null||value<0||!Number.isSafeInteger(value))continue;
  rows.push({codigo:'ACCIONES_EN_CIRCULACION',concepto:node.name,importe:value,provider:'EDINET',identifier:report.accession,currency:'shares',basis:'issuer_issued_shares',evidence:{...identity,start:null,end:report.end,context:node.attribs.contextRef,unit:'shares',entry:entries[0].entryName,shareDefinition:'TOTAL_ISSUED_SHARES_AT_FISCAL_YEAR_END',scope:'ISSUER_CAPITAL',policy:'JP_ISSUED_SHARES_FISCAL_END_V1'}});
 }
 if(new Set(rows.map(r=>r.importe)).size>1)throw Error('ACCIONES_JP_FACTS_CONTRADICTORIOS');
 return rows.slice(0,1);
}
