import type {Pool,RowDataPacket,ResultSetHeader} from 'mysql2/promise';
import {createHash} from 'node:crypto';
import type {DatoPcv,InformePcv} from './normalizarProveedores';
import {normalizarPartidas} from '../valoracion/datos';
import {kpiCalcularInforme} from '../../insercionDatos/insercionKPIInformeFinanciero';

export async function persistirRecuperacion(pool:Pool,informe:InformePcv,datos:DatoPcv[],write:boolean){
 const c=await pool.getConnection();const result={pcv:0,kpiNew:0,kpiUpdated:0,kpiSkipped:false,byProvider:{} as Record<string,number>};
 try{await c.beginTransaction();
  const [meta]=await c.query<RowDataPacket[]>('SELECT * FROM informe_financiero WHERE id=? FOR UPDATE',[informe.id]);
  if(meta.length!==1||meta[0].empresa_id!==informe.empresa_id||meta[0].fecha_fin_periodo!==informe.end||meta[0].identificador_fuente!==informe.accession)throw new Error('INFORME_CAMBIO_DESDE_SELECCION');
  const [tax]=await c.query<RowDataPacket[]>('SELECT * FROM taxonomia_concepto WHERE activo=1');const map=new Map(tax.map(t=>[t.concepto_estandar,t]));
  const record=async(type:string,id:number,provider:string,code:string,before:unknown,after:unknown,evidence:unknown)=>{await c.query(`INSERT INTO pcv_import_evidence(informe_id,record_type,record_id,provider,source_identifier,concept_code,evidence_json) VALUES(?,?,?,?,?,?,?)`,[informe.id,type,id,provider,informe.accession,code,JSON.stringify({before,after,evidence,policy:'MISSING_ONLY_PCV_V1',observed_at:new Date().toISOString()})]);};
  const [initial]=await c.query<RowDataPacket[]>('SELECT pc.*,tc.concepto_estandar FROM partida_contable_valor pc LEFT JOIN taxonomia_concepto tc ON tc.id=pc.concepto_estandar_id WHERE pc.informe_id=?',[informe.id]);
  const anchors=['INGRESOS','ACTIVOS_TOTALES','PASIVOS_TOTALES','FLUJO_CAJA_OPERATIVO'];
  for(const d of datos){if(!Number.isFinite(d.importe)||!map.has(d.codigo))continue;
   if(d.identifier!==informe.accession||!['USD','JPY','shares','USD/shares','JPY/shares'].includes(d.currency)||d.evidence.end&&d.evidence.end!==informe.end)throw new Error('PROCEDENCIA_INVALIDA');
   if(anchors.includes(d.codigo)){const stored=initial.filter(p=>p.concepto_estandar===d.codigo&&p.importe!==null);if(stored.some(p=>Math.abs(Number(p.importe)-d.importe)>Math.max(1,Math.abs(d.importe)*1e-8)))throw new Error('PERIMETRO_O_UNIDAD_CONTRADICTORIA_'+d.codigo);}
  }
  const seen=new Set<string>();
  for(const d of datos){const t=map.get(d.codigo);if(!t||seen.has(d.codigo))continue;seen.add(d.codigo);
   const old=initial.filter(p=>Number(p.concepto_estandar_id)===Number(t.id));
   if(old.some(p=>p.importe!==null)||old.length>1)continue;
   let id:number,before:unknown=null;
   if(old.length===1){id=old[0].id;before=old[0];await c.query('UPDATE partida_contable_valor SET concepto=?,importe=?,nivel_confianza=? WHERE id=? AND importe IS NULL',[d.concepto,d.importe,'ALTA',id]);}
   else{const [r]=await c.query<ResultSetHeader>('INSERT INTO partida_contable_valor(informe_id,concepto,concepto_estandar_id,importe,nivel_confianza) VALUES(?,?,?,?,?)',[informe.id,d.concepto,t.id,d.importe,'ALTA']);id=r.insertId;}
   await record('PCV',id,d.provider,d.codigo,before,{importe:d.importe,concepto:d.concepto},d);
   result.pcv++;result.byProvider[d.provider]=(result.byProvider[d.provider]||0)+1;
  }
  const [parts]=await c.query<RowDataPacket[]>(`SELECT pc.concepto,pc.importe,tc.concepto_estandar,tc.signo_esperado,tc.alias_sec,tc.alias_edinet,tc.alias_finmind FROM partida_contable_valor pc JOIN taxonomia_concepto tc ON tc.id=pc.concepto_estandar_id WHERE pc.informe_id=? ORDER BY pc.id`,[informe.id]);
  let kpis:ReturnType<typeof kpiCalcularInforme>=[];try{kpis=kpiCalcularInforme(informe.id,normalizarPartidas(parts as any,meta[0].fuente).valores);}catch{result.kpiSkipped=true;}
  const [oldKpis]=await c.query<RowDataPacket[]>('SELECT * FROM kpi_financiero_informe WHERE informe_id=? FOR UPDATE',[informe.id]);
  for(const k of kpis){if(k.valor===null||!Number.isFinite(k.valor))continue;const old=oldKpis.find(x=>x.kpi===k.kpi);if(old&&old.valor!==null&&Math.abs(Number(old.valor)-k.valor)<1e-9)continue;
   // Existing valid KPI is recalculated only after new PCV changed this report.
   if(old&&old.valor!==null&&!result.pcv)continue;
   let id:number;if(old){id=Number(old.id);await c.query('UPDATE kpi_financiero_informe SET valor=?,unidad=?,nivel_confianza=?,fecha_calculo=CURRENT_TIMESTAMP WHERE id=?',[k.valor,k.unidad,k.nivelConfianza,id]);result.kpiUpdated++;}
   else{const [r]=await c.query<ResultSetHeader>('INSERT INTO kpi_financiero_informe(informe_id,kpi,valor,unidad,nivel_confianza,fecha_calculo) VALUES(?,?,?,?,?,CURRENT_TIMESTAMP)',[informe.id,k.kpi,k.valor,k.unidad,k.nivelConfianza]);id=r.insertId;result.kpiNew++;}
   await record('KPI',id,'FORMULA_EXISTENTE',k.kpi,old||null,k,{formulaHash:createHash('sha256').update(kpiCalcularInforme.toString()).digest('hex'),inputsHash:createHash('sha256').update(JSON.stringify(parts)).digest('hex')});
  }
  if(write)await c.commit();else await c.rollback();return result;
 }catch(e){await c.rollback();throw e;}finally{c.release();}
}
