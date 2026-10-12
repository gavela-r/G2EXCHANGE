import type {RowDataPacket} from 'mysql2/promise';
import type {Db,PerfilRating} from './datos';
/** Exact source categories. Broad technology/finance buckets remain unresolved. */
export const TW_CATEGORIES:Readonly<Record<string,number>>={
 '半導體業':19,'食品工業':181,'鋼鐵工業':10,'汽車工業':9,
 '通信網路業':62,'電機機械':20,'電器電纜':46,'電子零組件業':46,
 '紡織纖維':56,'航運業':131,'造紙工業':97,'建材營造':31,
 '塑膠工業':3,'化學工業':3,'油電燃氣業':6
};
export function clasificarTaiwan(categories:string[]):{sectorId?:number;status:'ACCEPTED'|'PENDING';criterion:string} {
 const unique=[...new Set(categories)];
 // Electronics is an umbrella supplied alongside semiconductor classification, not contrary evidence.
 const specific=unique.filter(x=>x!=='電子工業');
 const mapped=specific.map(x=>TW_CATEGORIES[x]);
 if(!specific.length||mapped.some(x=>x===undefined)||new Set(mapped).size!==1)return {status:'PENDING',criterion:'TW_EXACT_CATEGORY_V1: unmapped or conflicting source categories'};
 return {sectorId:mapped[0],status:'ACCEPTED',criterion:'TW_EXACT_CATEGORY_V1: exact category; electronics umbrella excluded'};
}
export async function clasificacionVigente(db:Db,companyId:number,date:string):Promise<RowDataPacket|undefined> {
 try{const [rows]=await db.query<RowDataPacket[]>('SELECT * FROM classification_evidence WHERE empresa_id=? AND reference_date<=? ORDER BY reference_date DESC,id DESC LIMIT 1',[companyId,date]);
 const row=rows[0];return row?.status==='ACCEPTED'&&row.confidence==='HIGH'?row:undefined;
 }catch(e:any){if(e.code==='ER_NO_SUCH_TABLE')return undefined;throw e;}
}
/** System policy based on observed USD size, never a guessed country FX or financial rating. */
export function perfilPorCapitalizacion(country:string,currency:string,family:string,price:number,shares:number):{profile:PerfilRating;criterion:string;marketCap:number}|undefined {
 if(country!=='US'||currency!=='USD'||!Number.isFinite(price)||!Number.isFinite(shares)||price<=0||shares<=0)return undefined;
 if(['BANK','INSURANCE'].includes(family))return {profile:'FINANCIERA',criterion:'VERIFIED_FINANCIAL_FAMILY_V1',marketCap:price*shares};
 const marketCap=price*shares;if(!Number.isFinite(marketCap)||marketCap===5e9)return undefined;
 return {profile:marketCap>5e9?'GRANDE_NO_FINANCIERA':'PEQUEÑA_RIESGOSA',criterion:'DAMODARAN_SIZE_5BN_USD_V1: price x reported outstanding shares; REVIEW proxy',marketCap};
}
