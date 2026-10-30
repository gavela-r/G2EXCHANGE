import type {Pool,PoolConnection} from 'mysql2/promise';
import {createHash} from 'node:crypto';
import {fechaCivil} from './fecha';
export const hash=(x:unknown)=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
export interface Observacion {
 instrumentoId:number; fecha:string; mercadoId:number; moneda:string; cierre:number;
 apertura?:number|null; maximo?:number|null; minimo?:number|null; ajustado?:number|null;
 volumen?:number|null; importe?:number|null; tipoImporte:'OBSERVED'|'ESTIMATED'|'UNKNOWN';
 fuente:string; feed:string; obtenido:string; ajuste:string;
 estado:'VALID'|'UNRECONCILED'|'REJECTED'; evidencia:Record<string,unknown>;
}
export function validarObservacion(o:Observacion){
 fechaCivil(o.fecha);
 if(!Number.isSafeInteger(o.instrumentoId)||o.instrumentoId<=0||!Number.isSafeInteger(o.mercadoId)
 ||!/^[A-Z]{3}$/.test(o.moneda)||!Number.isFinite(o.cierre)||o.cierre<=0||!o.fuente||!o.feed||!o.ajuste
 ||!['VALID','UNRECONCILED','REJECTED'].includes(o.estado)||!['OBSERVED','ESTIMATED','UNKNOWN'].includes(o.tipoImporte)
 ||!Number.isFinite(Date.parse(o.obtenido)))throw Error('Observación bursátil inválida');
 for(const v of [o.apertura,o.maximo,o.minimo,o.ajustado,o.volumen,o.importe])if(v!=null&&(!Number.isFinite(v)||v<0))throw Error('Campo bursátil inválido');
 if(o.importe!=null&&o.tipoImporte==='UNKNOWN'||o.importe==null&&o.tipoImporte!=='UNKNOWN')throw Error('Procedencia del importe inconsistente');
 if(o.maximo!=null&&o.minimo!=null&&(o.maximo<o.minimo||o.cierre<o.minimo||o.cierre>o.maximo))throw Error('OHLC inconsistente');
}
export function identidadEstructural(i:any):string|null {
 if(i.codigo_iso==='TW'&&/TOKYO/i.test(i.nombre_bolsa))return 'IDENTIDAD_TW_TOKYO_NO_CONCILIADA';
 const cc:Record<string,string>={US:'USD',JP:'JPY',TW:'TWD'};
 if(cc[i.codigo_iso]&&cc[i.codigo_iso]!==i.moneda)return 'MONEDA_MERCADO_NO_CONCILIADA';
 return null;
}
export async function instrumento(c:Pick<PoolConnection,'query'>,id:number,lock=false){
 const [rs]:any=await c.query(`SELECT i.*,p.codigo_iso,m.nombre_bolsa,e.nombre_empresa,e.sector_id
 FROM instrumento i JOIN empresa e ON e.id=i.empresa_id JOIN pais p ON p.id=e.pais_id JOIN mercado m ON m.id=i.mercado_id WHERE i.id=? ${lock?'FOR UPDATE':''}`,[id]);
 if(rs.length!==1)throw Error('Instrumento inexistente');return rs[0];
}
/** Una sesión se añade; una revisión se añade con otra versión; repetir idéntico contenido es idempotente. */
export async function guardarObservacion(pool:Pool,o:Observacion){
 validarObservacion(o);
 for(let attempt=0;attempt<3;attempt++){
 const c=await pool.getConnection();try{
 await c.beginTransaction();const i=await instrumento(c,o.instrumentoId,true);
 const blocked=identidadEstructural(i);if(blocked)throw Error(blocked);
 if(i.mercado_id!==o.mercadoId||i.moneda!==o.moneda)throw Error('Mercado/moneda distintos de identidad');
 const [blocks]:any=await c.query("SELECT status FROM capital_identity_evidence WHERE instrumento_id=? AND provider<>'LEGACY_QUOTE' AND reference_date<=? ORDER BY reference_date DESC,id DESC LIMIT 1",[o.instrumentoId,o.fecha]);
 if(blocks[0]?.status==='BLOCKED')throw Error('IDENTIDAD_BLOQUEADA');
 // fetched_at no forma parte de la identidad económica del dato.
 const {obtenido:_,...content}=o;const digest=hash(content);
 const [old]:any=await c.query('SELECT id,revision FROM capital_daily_observation WHERE observation_hash=?',[digest]);
 if(old.length){await c.commit();return {id:old[0].id,inserted:false,revision:old[0].revision};}
 const [[r]]:any=await c.query('SELECT COALESCE(MAX(revision),0)+1 revision FROM capital_daily_observation WHERE instrumento_id=? AND session_date=? AND source=? AND feed=?',[o.instrumentoId,o.fecha,o.fuente,o.feed]);
 const [res]:any=await c.query(`INSERT INTO capital_daily_observation(instrumento_id,session_date,market_id,currency,open_price,high_price,low_price,close_price,adjusted_close,share_volume,traded_value,value_kind,source,feed,fetched_at,adjustment_type,validation_status,revision,observation_hash,evidence_json)
 VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,[o.instrumentoId,o.fecha,o.mercadoId,o.moneda,o.apertura??null,o.maximo??null,o.minimo??null,o.cierre,o.ajustado??null,o.volumen??null,o.importe??null,o.tipoImporte,o.fuente,o.feed,new Date(o.obtenido),o.ajuste,o.estado,r.revision,digest,JSON.stringify(o.evidencia)]);
 if(o.estado!=='REJECTED'){
 // Preserva la fila legacy original antes de corregir el par fecha/precio.
 const [legacy]:any=await c.query('SELECT * FROM cotizacion_diaria WHERE instrumento_id=? FOR UPDATE',[o.instrumentoId]);
 if(legacy.length){const evidence={legacy:legacy[0],reason:'Fecha del precio legacy no certificada; excluido de rentabilidades'};
 const h=hash(evidence);await c.query(`INSERT IGNORE INTO capital_identity_evidence(instrumento_id,provider,provider_id,market_id,status,reference_date,evidence_json,evidence_hash) VALUES (?,?,?,?,?,?,?,?)`,[o.instrumentoId,'LEGACY_QUOTE',String(legacy[0].id),o.mercadoId,'PARTIAL',o.fecha,JSON.stringify(evidence),h]);}
 // Orden de llegada y backfill no deben retroceder el último precio.
 const [[latest]]:any=await c.query(`SELECT session_date,close_price FROM capital_daily_observation WHERE instrumento_id=? AND validation_status<>'REJECTED' ORDER BY session_date DESC,id DESC LIMIT 1`,[o.instrumentoId]);
 if(!legacy.length||latest.session_date>=legacy[0].fecha)await c.query(`INSERT INTO cotizacion_diaria(instrumento_id,fecha,precio_cierre) VALUES (?,?,?) ON DUPLICATE KEY UPDATE fecha=VALUES(fecha),precio_cierre=VALUES(precio_cierre)`,[o.instrumentoId,latest.session_date,latest.close_price]);
 }
 await c.commit();return {id:res.insertId,inserted:true,revision:r.revision};
 }catch(e:any){await c.rollback();if(['ER_LOCK_DEADLOCK','ER_LOCK_WAIT_TIMEOUT'].includes(e.code)&&attempt<2){await new Promise(r=>setTimeout(r,50*(attempt+1)));continue;}throw e;}finally{c.release();}
 }throw Error('Reintentos agotados');
}
export async function serie(c:Pick<PoolConnection,'query'>,id:number,from:string,to:string,source:string,feed:string){
 fechaCivil(from);fechaCivil(to);if(from>to)throw Error('Rango invertido');
 const [rows]:any=await c.query(`SELECT * FROM (SELECT o.*,ROW_NUMBER() OVER(PARTITION BY session_date ORDER BY revision DESC,id DESC) rn FROM capital_daily_observation o WHERE instrumento_id=? AND session_date BETWEEN ? AND ? AND source=? AND feed=?) x WHERE rn=1 ORDER BY session_date LIMIT 5000`,[id,from,to,source,feed]);
 if(rows.length===5000)throw Error('Límite de serie alcanzado: dividir el rango; no utilizar una serie truncada');
 return rows;
}
export async function ultimaCotizacionValidada(c:Pick<PoolConnection,'query'>,id:number,asOf:string,source:string,feed:string){
 fechaCivil(asOf);if(!source||!feed)throw Error('Fuente y feed explícitos requeridos');
 const [rows]:any=await c.query(`SELECT * FROM (SELECT o.*,ROW_NUMBER() OVER(PARTITION BY session_date ORDER BY revision DESC,id DESC) rn FROM capital_daily_observation o WHERE instrumento_id=? AND session_date<=? AND source=? AND feed=?) x WHERE rn=1 AND validation_status='VALID' ORDER BY session_date DESC LIMIT 1`,[id,asOf,source,feed]);
 return rows[0]??null;
}
/** Calendario externo acreditado, nunca inferido de las cotizaciones recibidas. */
export function calendarioObservaciones(rows:any[],asOf:string){
 fechaCivil(asOf);const calendars:any[]=[];
 for(const row of rows){const e=typeof row.evidence_json==='string'?JSON.parse(row.evidence_json):row.evidence_json,c=e?.sessionCalendar;
  if(!c||c.verificado!==true||c.marketId!==row.market_id||!/^https?:\/\//.test(c.fuente??'')||!Array.isArray(c.sesiones)||!c.sesiones.length||c.sesiones.length>5000)continue;
  try{fechaCivil(c.conocidoDesde);c.sesiones.forEach(fechaCivil);}catch{continue;}
  if(c.conocidoDesde>asOf||new Set(c.sesiones).size!==c.sesiones.length)continue;
  calendars.push(c);
 }
 calendars.sort((a,b)=>b.conocidoDesde.localeCompare(a.conocidoDesde));
 if(!calendars.length)return undefined;
 const first=calendars[0];if(calendars.some(c=>c.conocidoDesde===first.conocidoDesde&&JSON.stringify([...c.sesiones].sort())!==JSON.stringify([...first.sesiones].sort())))return undefined;
 return {sesiones:[...first.sesiones].sort() as string[],fuente:first.fuente as string,verificado:true};
}
export async function registrarAlias(pool:Pool,args:{instrumentoId:number;marketId:number;provider:string;externalId:string;shareClass:string;evidenceId:number}){
 if(!args.provider||!args.externalId||!args.shareClass)throw Error('Alias requiere proveedor, mercado y clase');
 const c=await pool.getConnection();try{await c.beginTransaction();const i=await instrumento(c,args.instrumentoId,true);if(identidadEstructural(i)||i.mercado_id!==args.marketId)throw Error('Identidad no conciliada');
  const [proof]:any=await c.query("SELECT id FROM capital_identity_evidence WHERE id=? AND instrumento_id=? AND market_id=? AND provider=? AND provider_id=? AND status='VERIFIED'",[args.evidenceId,args.instrumentoId,args.marketId,args.provider,args.externalId]);if(!proof.length)throw Error('Evidencia de identidad insuficiente para alias');
  const [existing]:any=await c.query('SELECT * FROM capital_instrument_alias WHERE provider=? AND external_identifier=? AND market_id=? AND share_class=? FOR UPDATE',[args.provider,args.externalId,args.marketId,args.shareClass]);
  if(existing.length){if(existing[0].instrumento_id!==args.instrumentoId)throw Error('ALIAS_COLISION: no reasignar');await c.commit();return existing[0].id;}
  const [r]:any=await c.query('INSERT INTO capital_instrument_alias(instrumento_id,market_id,provider,external_identifier,share_class,identity_evidence_id) VALUES (?,?,?,?,?,?)',[args.instrumentoId,args.marketId,args.provider,args.externalId,args.shareClass,args.evidenceId]);await c.commit();return r.insertId;
 }catch(e){await c.rollback();throw e;}finally{c.release();}
}
/** Adaptador de los tres escritores existentes: últimas operaciones no equivalen a barras diarias ajustadas. */
export async function guardarPreciosResueltos(pool:Pool,rows:{instrumentoId:number;fecha:string;precio:number;proveedor:string}[]){
 let count=0;for(const r of rows){const i=await instrumento(pool as any,r.instrumentoId);if(identidadEstructural(i))continue;
 await guardarObservacion(pool,{instrumentoId:r.instrumentoId,fecha:r.fecha,mercadoId:i.mercado_id,moneda:i.moneda,cierre:r.precio,tipoImporte:'UNKNOWN',fuente:r.proveedor,feed:'LEGACY_LATEST_TRADE',obtenido:new Date().toISOString(),ajuste:'UNVERIFIED',estado:'UNRECONCILED',evidencia:{tipo:'Ultima operación; no cierre diario certificado'}});count++;}return count;
}
