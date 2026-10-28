import {parse} from 'csv-parse/sync';
import iconv from 'iconv-lite';
export interface RegistroEdinet { edinetCode:string; securityCode:string; englishName:string; japaneseName:string; sector:string; listed:boolean; }
export interface EmpresaRegistro { id:number; nombre_empresa:string; tickers:string[]; }
const norm=(v:string)=>v.normalize('NFKC').toUpperCase().replace(/[^\p{L}\p{N}]/gu,'');
export function decodificarRegistroEdinet(buffer:Buffer):string {
 if(buffer[0]===0xff&&buffer[1]===0xfe)return iconv.decode(buffer,'utf16-le');
 if(buffer.subarray(0,3).equals(Buffer.from([0xef,0xbb,0xbf])))return buffer.subarray(3).toString('utf8');
 return iconv.decode(buffer,'cp932');
}
export function leerRegistroEdinetCsv(text:string):RegistroEdinet[]{
 const rows=parse(text,{skip_empty_lines:true,relax_column_count:true,bom:true}) as string[][];
 const h=rows.findIndex(row=>row.some(s=>String(s).normalize('NFKC').includes('EDINETコード')));if(h<0)throw new Error('REGISTRO_EDINET_ENCABEZADO');
 const header=rows[h].map(s=>s.normalize('NFKC')),index=(label:string)=>{const n=header.indexOf(label);if(n<0)throw new Error('REGISTRO_EDINET_COLUMNA_'+label);return n;};
 const c={code:index('EDINETコード'),sec:index('証券コード'),english:index('提出者名(英字)'),japanese:index('提出者名'),sector:index('提出者業種'),listed:index('上場区分')};
 return rows.slice(h+1).flatMap(r=>{const edinetCode=String(r[c.code]||'').trim();if(!/^E\d{5}$/.test(edinetCode))return [];return [{edinetCode,securityCode:String(r[c.sec]||'').trim().normalize('NFKC').toUpperCase(),englishName:String(r[c.english]||'').trim(),japaneseName:String(r[c.japanese]||'').trim(),sector:String(r[c.sector]||'').trim(),listed:r[c.listed]==='上場'}];});
}
export function vincularRegistroEdinet(companies:EmpresaRegistro[],registry:RegistroEdinet[]){
 const proposed=new Map<string,{company:EmpresaRegistro;registro:RegistroEdinet;criterion:string}[]>();
 const exactIndex=new Map<string,RegistroEdinet[]>(),legacyIndex=new Map<string,RegistroEdinet[]>();
 for(const r of registry){if(!r.englishName)continue;const key=norm(r.englishName);exactIndex.set(key,[...(exactIndex.get(key)||[]),r]);if(r.englishName.includes(',')){const prefix=norm(r.englishName.split(',')[0]);legacyIndex.set(prefix,[...(legacyIndex.get(prefix)||[]),r]);}}
 for(const company of companies){const name=norm(company.nombre_empresa);if(!name||name==='NA')continue;
  const matches=[...new Set([...(exactIndex.get(name)||[]),...(legacyIndex.get(name)||[])])].filter(r=>{if(!r.englishName)return false;const exact=norm(r.englishName)===name,legacy=r.englishName.includes(',')&&norm(r.englishName.split(',')[0])===name;
   const security=company.tickers.some(t=>t===r.securityCode||t+'0'===r.securityCode);
   return (exact&&(!company.tickers.length||security))||(legacy&&security);
  });
  if(matches.length!==1)continue;const r=matches[0],entry={company,registro:r,criterion:norm(r.englishName)===name?'EXACT_ENGLISH_COUNTRY_AND_REGISTRY':'LEGACY_QUOTED_CSV_NAME_WITH_INDEPENDENT_SECURITY_CODE'};
  const existing=proposed.get(r.edinetCode)||[];existing.push(entry);proposed.set(r.edinetCode,existing);
 }
 return new Map([...proposed].filter(([,rows])=>rows.length===1).map(([key,rows])=>[key,rows[0]]));
}
export function validarDocumentoAnualEdinet(d:any):boolean {
 const date=(v:any)=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&!Number.isNaN(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v;
 if(d?.docTypeCode!=='120'||d.xbrlFlag!=='1'||d.withdrawalStatus!=='0'||d.disclosureStatus!=='0'||!/^S[A-Z0-9]{7}$/.test(d.docID||'')||!date(d.periodStart)||!date(d.periodEnd)||!date(String(d.submitDateTime||'').slice(0,10)))return false;
 const year=Number(d.periodEnd.slice(0,4)),days=(Date.parse(d.periodEnd)-Date.parse(d.periodStart))/86400000;
 return year>=2022&&year<=2025&&days>=350&&days<=380;
}
