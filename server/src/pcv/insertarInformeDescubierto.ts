import type {Pool,RowDataPacket,ResultSetHeader} from 'mysql2/promise';
import type {DatoPcv,InformePcv,IdentidadJp} from './normalizarProveedores';
import {persistirRecuperacion} from './persistirRecuperacion';
export async function insertarInformeDescubierto(pool:Pool,report:InformePcv,start:string,identity:IdentidadJp,datos:DatoPcv[],evidence:Record<string,unknown>,write:boolean){
 if(report.country!=='JP'||identity.end!==report.end||!report.tickers.some(t=>identity.securityCode===t||identity.securityCode===t+'0')||!datos.some(d=>d.evidence.start===start))throw new Error('INFORME_NUEVO_IDENTIDAD_PERIODO');
 const c=await pool.getConnection();try{await c.beginTransaction();
  const [companies]=await c.query<RowDataPacket[]>("SELECT e.id,e.nombre_empresa,p.codigo_iso FROM empresa e JOIN pais p ON p.id=e.pais_id WHERE e.id=? FOR UPDATE",[report.empresa_id]);
  if(companies.length!==1||companies[0].codigo_iso!=='JP'||companies[0].nombre_empresa!==report.nombre_empresa)throw new Error('EMPRESA_CAMBIO_DESDE_REGISTRO');
  const [old]=await c.query<RowDataPacket[]>("SELECT * FROM informe_financiero WHERE empresa_id=? AND tipo_periodo='ANUAL' AND YEAR(fecha_fin_periodo)=? FOR UPDATE",[report.empresa_id,Number(report.end.slice(0,4))]);
  if(old.length){await c.rollback();return {inserted:false,reason:'ANUAL_YA_EXISTE'};}
  const [r]=await c.query<ResultSetHeader>("INSERT INTO informe_financiero(empresa_id,tipo_periodo,tipo_documento,fecha_fin_periodo,fecha_publicacion,fuente,identificador_fuente) VALUES(?,'ANUAL','Annual Securities Report',?,?,'EDINET',?)",[report.empresa_id,report.end,report.filed,report.accession]);
  const actual={...report,id:r.insertId};
  await c.query('INSERT INTO financial_report_evidence(informe_id,empresa_id,provider,source_identifier,registry_identifier,evidence_json) VALUES(?,?,?,?,?,?)',[actual.id,actual.empresa_id,'EDINET',actual.accession,identity.edinetCode,JSON.stringify({identity,start,end:actual.end,published:actual.filed,...evidence})]);
  const adapter={getConnection:async()=>({query:c.query.bind(c),beginTransaction:async()=>{},commit:async()=>{},rollback:async()=>{},release(){}})} as unknown as Pool;
  const result=await persistirRecuperacion(adapter,actual,datos,true);
  if(!result.pcv)throw new Error('INFORME_NUEVO_SIN_PCV_VALIDO');
  if(write)await c.commit();else await c.rollback();return {inserted:true,report:actual.id,...result};
 }catch(e){await c.rollback();throw e;}finally{c.release();}
}
