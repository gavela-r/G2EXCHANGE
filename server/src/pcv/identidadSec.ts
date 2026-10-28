import {normalizarSec,numeroReportado,type InformePcv,type DatoPcv} from './normalizarProveedores';

// Only explicit legal abbreviations, punctuation and the SEC state suffix.
// No edit distance, partial names, translated names or removed business words.
export function nombreLegalSec(name:string):string {
 const aliases:Record<string,string>={CO:'COMPANY',CORP:'CORPORATION',INC:'INCORPORATED',LTD:'LIMITED'};
 return String(name||'').normalize('NFKC').toUpperCase().replace(/\s*\/[A-Z]{2}\/\s*$/,'').replace(/&/g,' AND ').replace(/[^\p{L}\p{N}]+/gu,' ').trim().split(/\s+/).filter((token,index)=>index!==0||token!=='THE').map(token=>aliases[token]||token).join('');
}
export function identidadLegalSec(i:InformePcv,cik:string,facts:any,submission:any):'CURRENT_LEGAL_NAME'|'DATED_FORMER_LEGAL_NAME'|null {
 if(!/^\d{10}$/.test(cik)||Number(facts?.cik)!==Number(cik)||Number(submission?.cik)!==Number(cik))return null;
 const name=nombreLegalSec(i.nombre_empresa);if(name.length<5||name==='NA')return null;
 if(name===nombreLegalSec(facts.entityName)&&name===nombreLegalSec(submission.name))return 'CURRENT_LEGAL_NAME';
 if(Array.isArray(submission.formerNames)&&submission.formerNames.some((n:any)=>nombreLegalSec(n.name)===name&&String(n.from).slice(0,10)<=i.filed&&String(n.to).slice(0,10)>=i.filed))return 'DATED_FORMER_LEGAL_NAME';
 return null;
}
export function presentacionSecCoincide(i:InformePcv,filings:any):boolean {
 if(!Array.isArray(filings?.accessionNumber))return false;
 const indexes=filings.accessionNumber.flatMap((a:string,n:number)=>a===i.accession?[n]:[]);
 return indexes.length===1&&indexes.every((n:number)=>filings.reportDate?.[n]===i.end&&filings.filingDate?.[n]===i.filed&&filings.form?.[n]===i.form);
}
export function normalizarSecVinculado(facts:any,submission:any,filings:any,i:InformePcv,cik:string,evidence:Record<string,unknown>):DatoPcv[]{
 const criterion=identidadLegalSec(i,cik,facts,submission);
 if(!criterion||!presentacionSecCoincide(i,filings))throw Error('SEC_VINCULO_DOCUMENTAL_PENDIENTE');
 // The DTO name is adapted only after both the independent legal-name check
 // and the issuer's exact accession/date/form/period have been verified.
 // Neither the stored company name nor the original normalizer is changed.
 return normalizarSec(facts,{...i,nombre_empresa:facts.entityName},cik).filter(d=>numeroReportado(d.importe)!==null).map(d=>({...d,evidence:{...d.evidence,identityBinding:{databaseName:i.nombre_empresa,officialName:facts.entityName,cik,criterion,policy:'SEC_LEGAL_ABBREVIATIONS_EXACT_FILING_V1',...evidence}}}));
}
