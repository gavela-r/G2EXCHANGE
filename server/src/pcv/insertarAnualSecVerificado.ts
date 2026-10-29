import type {Pool,RowDataPacket,ResultSetHeader} from 'mysql2/promise';
import type {DatoPcv,InformePcv} from './normalizarProveedores';
import {persistirRecuperacionVerificada,type ContextoPcvVerificado} from './persistirRecuperacionVerificada';
import {formularioAnualSec,type PresentacionAnualSec} from './secAnualVerificado';
export async function insertarAnualSecVerificado(pool:Pool,i:InformePcv,filing:PresentacionAnualSec,cik:string,rows:DatoPcv[],context:ContextoPcvVerificado,evidence:Record<string,unknown>,write:boolean){
 const comparative=i.end!==filing.end;
 if(i.country!=='US'||!/^\d{10}$/.test(cik)||!formularioAnualSec(filing.form)||i.form!==filing.form||i.filed!==filing.filed||i.end>filing.end||i.accession!==(comparative?filing.accession+'@'+i.end:filing.accession)||context.currency!=='USD'||!rows.length||!rows.some(d=>d.evidence.start===context.start)||!rows.every(d=>d.evidence.cik===cik&&d.evidence.accession===filing.accession&&d.evidence.end===i.end))throw Error('SEC_NUEVO_INFORME_SIN_EVIDENCIA');
 const c=await pool.getConnection();try{await c.beginTransaction();const [company]=await c.query<RowDataPacket[]>("SELECT e.id,e.nombre_empresa,p.codigo_iso FROM empresa e JOIN pais p ON p.id=e.pais_id WHERE e.id=? FOR UPDATE",[i.empresa_id]);
  if(company.length!==1||company[0].nombre_empresa!==i.nombre_empresa||company[0].codigo_iso!=='US')throw Error('EMPRESA_CAMBIO_DESDE_REGISTRO');
  const [old]=await c.query<RowDataPacket[]>("SELECT id FROM informe_financiero WHERE empresa_id=? AND tipo_periodo='ANUAL' AND YEAR(fecha_fin_periodo)=? FOR UPDATE",[i.empresa_id,Number(i.end.slice(0,4))]);
  if(old.length){await c.rollback();return {inserted:false,reason:'ANUAL_YA_EXISTE'};}
  const [r]=await c.query<ResultSetHeader>("INSERT INTO informe_financiero(empresa_id,tipo_periodo,tipo_documento,fecha_fin_periodo,fecha_publicacion,fuente,identificador_fuente) VALUES(?,'ANUAL',?,?,?,'SEC_EDGAR',?)",[i.empresa_id,filing.form+(comparative?':COMPARATIVE':''),i.end,i.filed,i.accession]);
  const actual={...i,id:r.insertId};await c.query('INSERT INTO financial_report_evidence(informe_id,empresa_id,provider,source_identifier,registry_identifier,evidence_json) VALUES(?,?,?,?,?,?)',[actual.id,actual.empresa_id,'SEC_EDGAR',actual.accession,cik,JSON.stringify({policy:'SEC_ANNUAL_OR_EXPLICIT_COMPARATIVE_V1',filing,context,comparative,period_start:context.start,period_end:i.end,...evidence})]);
  const adapter={getConnection:async()=>({query:c.query.bind(c),beginTransaction:async()=>{},commit:async()=>{},rollback:async()=>{},release(){}})} as unknown as Pool;
  const result=await persistirRecuperacionVerificada(adapter,actual,rows,context,true);if(!result.pcv)throw Error('SEC_NUEVO_INFORME_SIN_PCV_VALIDO');
  if(write)await c.commit();else await c.rollback();return {inserted:true,report:actual.id,...result};
 }catch(e){await c.rollback();throw e;}finally{c.release();}
}
