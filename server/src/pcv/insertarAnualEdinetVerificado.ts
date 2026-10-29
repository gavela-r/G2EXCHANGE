import type {Pool,RowDataPacket,ResultSetHeader} from 'mysql2/promise';
import type {DatoPcv,InformePcv,IdentidadJp} from './normalizarProveedores';
import {persistirRecuperacionVerificada,type ContextoPcvVerificado} from './persistirRecuperacionVerificada';
export async function insertarAnualEdinetVerificado(pool:Pool,i:InformePcv,source:{docId:string;end:string;published:string},identity:IdentidadJp,rows:DatoPcv[],context:ContextoPcvVerificado,evidence:Record<string,unknown>,write:boolean){
 const comparative=i.end!==source.end;
 if(i.country!=='JP'||!/^S[A-Z0-9]{7}$/.test(source.docId)||!/^E\d{5}$/.test(identity.edinetCode)||i.accession!==(comparative?source.docId+'@'+i.end:source.docId)||i.end>source.end||i.filed!==source.published||identity.end!==i.end||!i.tickers.some(t=>t===identity.securityCode||t+'0'===identity.securityCode)||context.currency!=='JPY'||!rows.length||!rows.some(d=>d.evidence.start===context.start)||rows.some(d=>d.evidence.edinetCode!==identity.edinetCode||d.evidence.end!==i.end))throw Error('EDINET_NUEVO_INFORME_SIN_EVIDENCIA');
 const c=await pool.getConnection();try{await c.beginTransaction();const [company]=await c.query<RowDataPacket[]>("SELECT e.id,e.nombre_empresa,p.codigo_iso FROM empresa e JOIN pais p ON p.id=e.pais_id WHERE e.id=? FOR UPDATE",[i.empresa_id]);
  if(company.length!==1||company[0].nombre_empresa!==i.nombre_empresa||company[0].codigo_iso!=='JP')throw Error('EMPRESA_CAMBIO_DESDE_REGISTRO');
  const [old]=await c.query<RowDataPacket[]>("SELECT id FROM informe_financiero WHERE empresa_id=? AND tipo_periodo='ANUAL' AND YEAR(fecha_fin_periodo)=? FOR UPDATE",[i.empresa_id,Number(i.end.slice(0,4))]);if(old.length){await c.rollback();return {inserted:false,reason:'ANUAL_YA_EXISTE'};}
  const [r]=await c.query<ResultSetHeader>("INSERT INTO informe_financiero(empresa_id,tipo_periodo,tipo_documento,fecha_fin_periodo,fecha_publicacion,fuente,identificador_fuente) VALUES(?,'ANUAL',?,?,?,'EDINET',?)",[i.empresa_id,comparative?'ASR:COMPARATIVE':'Annual Securities Report',i.end,i.filed,i.accession]),actual={...i,id:r.insertId};
  await c.query('INSERT INTO financial_report_evidence(informe_id,empresa_id,provider,source_identifier,registry_identifier,evidence_json) VALUES(?,?,?,?,?,?)',[actual.id,actual.empresa_id,'EDINET',actual.accession,identity.edinetCode,JSON.stringify({policy:'EDINET_ANNUAL_OR_EXPLICIT_COMPARATIVE_V1',source,identity,context,comparative,...evidence})]);
  const adapter={getConnection:async()=>({query:c.query.bind(c),beginTransaction:async()=>{},commit:async()=>{},rollback:async()=>{},release(){}})} as unknown as Pool;
  const result=await persistirRecuperacionVerificada(adapter,actual,rows,context,true);if(!result.pcv)throw Error('EDINET_NUEVO_INFORME_SIN_PCV_VALIDO');if(write)await c.commit();else await c.rollback();return {inserted:true,report:actual.id,...result};
 }catch(e){await c.rollback();throw e;}finally{c.release();}
}
