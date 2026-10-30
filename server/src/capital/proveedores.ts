import type {Pool} from 'mysql2/promise';
import {guardarObservacion,hash,identidadEstructural,registrarAlias,type Observacion} from './historico';
import {fechaCivil} from './fecha';
import pinyin from 'pinyin';
export const PROVEEDORES=[
 {id:'TWSE_OPEN',estado:'DISPONIBLE',mercado:'TW',licencia:'https://data.gov.tw/en/datasets/11549',historico:'Capturas incrementales de OpenAPI; no reconstruye sesiones desaparecidas'},
 {id:'TPEX_OPEN',estado:'DISPONIBLE',mercado:'TW',licencia:'https://data.gov.tw/dataset/11371',historico:'Capturas incrementales de OpenAPI'},
 {id:'ALPACA',estado:'REQUIERE_DERECHOS_CORPORATIVOS',mercado:'US',licencia:'https://alpaca.markets/support/redistribute-alpaca-api',historico:'Adaptador paginado implementado; no redistribuir sin autorización'},
 {id:'JP',estado:'SIN_FUENTE_GRATUITA_CORPORATIVA_ACREDITADA',mercado:'JP',licencia:'https://jpx-jquants.com/en/help/usage',historico:'J-Quants personal excluido'}
];
/** Sólo endpoints oficiales fijos, timeout y tres reintentos limitados. Nunca sigue un URL del cliente. */
export async function obtenerJson(url:string,headers:Record<string,string>={}){
 const u=new URL(url);if(!['openapi.twse.com.tw','www.tpex.org.tw','data.alpaca.markets'].includes(u.hostname)||u.protocol!=='https:')throw Error('Host no permitido');
 for(let attempt=0;attempt<3;attempt++){
  let r:Response;
  try{r=await fetch(url,{headers,signal:AbortSignal.timeout(15000),redirect:'error'});}
  catch(e){if(attempt<2){await new Promise(ok=>setTimeout(ok,500*2**attempt));continue;}throw Error('PROVEEDOR_TRANSPORTE_TIMEOUT_O_RED');}
  if(r.ok){try{return await r.json();}catch(e){if(attempt<2){await new Promise(ok=>setTimeout(ok,500*2**attempt));continue;}throw Error('PROVEEDOR_CUERPO_JSON_INCOMPLETO');}}
  if((r.status===429||r.status>=500)&&attempt<2){const retry=Number(r.headers.get('retry-after'));await new Promise(ok=>setTimeout(ok,Math.min(10000,Number.isFinite(retry)&&retry>0?retry*1000:500*2**attempt)));continue;}
  throw Error(`PROVEEDOR_HTTP_${r.status}`);
 }throw Error('Reintentos agotados');
}
export function fechaTaiwan(raw:string){
 const s=String(raw).replaceAll('/','').trim();if(!/^\d{7,8}$/.test(s))throw Error('Fecha taiwanesa inválida');
 const year=s.length===7?Number(s.slice(0,3))+1911:Number(s.slice(0,4));return fechaCivil(`${year}-${s.slice(-4,-2)}-${s.slice(-2)}`);
}
export function numeroProveedor(x:unknown):number|null{
 if(typeof x!=='string'&&typeof x!=='number')return null;
 const s=String(x).replaceAll(',','').trim();if(!/^-?\d+(\.\d+)?$/.test(s))return null;const n=Number(s);return Number.isFinite(n)?n:null;
}
export function parseTwse(x:any,i:any,verified:boolean):Observacion|null{
 const cierre=numeroProveedor(x.ClosingPrice);if(cierre===null||cierre<=0)return null;
 const amount=numeroProveedor(x.TradeValue);
 return {instrumentoId:i.id,mercadoId:i.mercado_id,moneda:'TWD',fecha:fechaTaiwan(x.Date),cierre,
 apertura:numeroProveedor(x.OpeningPrice),maximo:numeroProveedor(x.HighestPrice),minimo:numeroProveedor(x.LowestPrice),
 volumen:numeroProveedor(x.TradeVolume),importe:amount,tipoImporte:amount==null?'UNKNOWN':'OBSERVED',fuente:'TWSE_OPEN',feed:'TWSE_OFFICIAL',
 obtenido:new Date().toISOString(),ajuste:'RAW_UNVERIFIED_ACTIONS',estado:verified?'VALID':'UNRECONCILED',
 evidencia:{url:'https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL',licencia:'https://data.gov.tw/en/datasets/11549',unidades:'TradeVolume:acciones; TradeValue:TWD',row:x}};
}
const normalized=(s:string)=>s.toLowerCase().replace(/[^a-z0-9\u3400-\u9fff]/g,'');
const romanized=(s:string)=>pinyin(s,{style:pinyin.STYLE_NORMAL}).map((x:string[])=>x[0]).join(' ');
export async function cargarTaiwan(pool:Pool,limit=5,afterInstrumentId=0){
 if(!Number.isInteger(limit)||limit<1||limit>20)throw Error('Carga controlada entre 1 y 20 instrumentos');
 if(!Number.isSafeInteger(afterInstrumentId)||afterInstrumentId<0)throw Error('Checkpoint de instrumento inválido');
 const quotes=await obtenerJson('https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL');
 const registry=await obtenerJson('https://openapi.twse.com.tw/v1/opendata/t187ap03_L');
 if(!Array.isArray(quotes)||!Array.isArray(registry))throw Error('Respuesta TWSE inesperada');
 const [inst]:any=await pool.query(`SELECT i.*,e.nombre_empresa,p.codigo_iso,m.nombre_bolsa FROM instrumento i JOIN empresa e ON e.id=i.empresa_id JOIN pais p ON p.id=e.pais_id JOIN mercado m ON m.id=i.mercado_id WHERE p.codigo_iso='TW' AND m.nombre_bolsa='TAIWAN STOCK EXCHANGE' AND i.moneda='TWD' AND i.id>? ORDER BY i.id`,[afterInstrumentId]);
 const result:any[]=[];
 for(const i of inst){if(result.length>=limit)break;
  const q=quotes.find((x:any)=>x.Code===i.ticker),legal=registry.filter((x:any)=>x['公司代號']===i.ticker);
  if(!q||legal.length!==1||identidadEstructural(i))continue;
  const official=legal[0];const matches=[q.Name,official['公司名稱'],official['公司簡稱'],official['英文簡稱']].filter(Boolean).some(n=>normalized(n)===normalized(i.nombre_empresa)||normalized(romanized(n))===normalized(i.nombre_empresa));
  // Código + bolsa + país + moneda + nombre exacto o romanización determinista. No búsqueda por ticker universal.
  if(!matches)continue;
  const day=fechaTaiwan(q.Date),evidence={policy:'TWSE_CODE_MARKET_COUNTRY_EXACT_NAME_OR_DETERMINISTIC_PINYIN_V1',official,company:i.nombre_empresa,market:i.nombre_bolsa,source:'https://openapi.twse.com.tw/v1/opendata/t187ap03_L',scope:'Listing identity; no certifica acciones netas de autocartera ni cambios de capital'};
  await pool.query(`INSERT IGNORE INTO capital_identity_evidence(instrumento_id,provider,provider_id,market_id,share_class,status,reference_date,evidence_json,evidence_hash) VALUES (?,?,?,?,?,?,?,?,?)`,[i.id,'TWSE_OPEN',i.ticker,i.mercado_id,'COMMON_LISTING','VERIFIED',day,JSON.stringify(evidence),hash(evidence)]);
  const [[proof]]:any=await pool.query('SELECT id FROM capital_identity_evidence WHERE evidence_hash=?',[hash(evidence)]);
  await registrarAlias(pool,{instrumentoId:i.id,marketId:i.mercado_id,provider:'TWSE_OPEN',externalId:i.ticker,shareClass:'COMMON_LISTING',evidenceId:proof.id});
  const bar=parseTwse(q,i,true);if(!bar)continue;
  const saved=await guardarObservacion(pool,bar);
  await pool.query(`INSERT INTO capital_download_checkpoint(instrumento_id,source,feed,cursor_json) VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE cursor_json=VALUES(cursor_json)`,[i.id,bar.fuente,bar.feed,JSON.stringify({lastSession:day,completeThrough:day,type:'DAILY_SNAPSHOT',previousSessionsUnavailable:true,hash:hash(q)})]);
  result.push({instrumentoId:i.id,ticker:i.ticker,fecha:day,...saved});
 }return {proveedor:'TWSE_OPEN',descargadas:quotes.length,incorporadas:result,licencia:'Open Government Data License v1.0',historicoAnteriorRecuperado:false,continuacion:{afterInstrumentId:result.at(-1)?.instrumentoId??afterInstrumentId,hayMasCandidatos:result.length===limit}};
}
export async function cargarTpex(pool:Pool,limit=5){
 if(!Number.isInteger(limit)||limit<1||limit>20)throw Error('Límite inválido');
 const rows=await obtenerJson('https://www.tpex.org.tw/openapi/v1/tpex_mainboard_daily_close_quotes');
 if(!Array.isArray(rows))throw Error('Respuesta TPEx inesperada');
 const [inst]:any=await pool.query(`SELECT i.*,e.nombre_empresa FROM instrumento i JOIN empresa e ON e.id=i.empresa_id JOIN mercado m ON m.id=i.mercado_id JOIN pais p ON p.id=e.pais_id WHERE p.codigo_iso='TW' AND m.nombre_bolsa='TAIPEI EXCHANGE' AND moneda='TWD' ORDER BY i.id`);
 const result=[];
 for(const i of inst){if(result.length>=limit)break;const x=rows.find((r:any)=>r.SecuritiesCompanyCode===i.ticker||r.SecuritiesCode===i.ticker);if(!x)continue;
  const name=x.CompanyName??x.SecuritiesCompanyName??x.SecuritiesName;
  if(!name||![normalized(name),normalized(romanized(name))].includes(normalized(i.nombre_empresa)))continue;
  const close=numeroProveedor(x.Close);if(!close||close<=0)continue;
  const amount=numeroProveedor(x.TransactionAmount),o:Observacion={instrumentoId:i.id,mercadoId:i.mercado_id,moneda:'TWD',fecha:fechaTaiwan(x.Date),cierre:close,apertura:numeroProveedor(x.Open),maximo:numeroProveedor(x.High),minimo:numeroProveedor(x.Low),volumen:numeroProveedor(x.TradingShares),importe:amount,tipoImporte:amount==null?'UNKNOWN':'OBSERVED',fuente:'TPEX_OPEN',feed:'TPEX_OFFICIAL',obtenido:new Date().toISOString(),ajuste:'RAW_UNVERIFIED_ACTIONS',estado:'UNRECONCILED',evidencia:{row:x,licencia:'https://data.gov.tw/dataset/11371',reason:'Nombre/código local coincidentes; pendiente contraste de registro de emisores TPEx'}};
  result.push(await guardarObservacion(pool,o));
  await pool.query(`INSERT INTO capital_download_checkpoint(instrumento_id,source,feed,cursor_json) VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE cursor_json=VALUES(cursor_json)`,[i.id,o.fuente,o.feed,JSON.stringify({lastSession:o.fecha,type:'DAILY_SNAPSHOT',identityPending:true})]);
 }return {proveedor:'TPEX_OPEN',descargadas:rows.length,incorporadas:result};
}
export async function cargarJapon(){return {proveedor:'JP',estado:'NO_DISPONIBLE',observaciones:[],historicoRecuperado:false,razon:'No existe una autorización corporativa gratuita acreditada. J-Quants personal se excluye expresamente.',fuenteCondiciones:'https://jpx-jquants.com/en/help/usage'};}
/** Descarga autorizada para uso interno: los derechos se verifican en configuración del servidor, nunca en payload HTTP. */
export async function cargarAlpaca(pool:Pool,instrumentId:number,start:string,end:string,feed:'iex'|'sip',rights:{corporateInternalUse:boolean;evidence:string}){
 fechaCivil(start);fechaCivil(end);if(start>end||!['iex','sip'].includes(feed))throw Error('Rango/feed inválido');
 if(!rights.corporateInternalUse||!rights.evidence)throw Error('LICENCIA_ALPACA_CORPORATIVA_NO_ACREDITADA');
 if(!process.env.ALPACA_KEY||!process.env.ALPACA_SECRET)throw Error('ALPACA_SIN_CREDENCIALES');
 const [rs]:any=await pool.query(`SELECT i.*,p.codigo_iso,m.nombre_bolsa FROM instrumento i JOIN empresa e ON e.id=i.empresa_id JOIN pais p ON p.id=e.pais_id JOIN mercado m ON m.id=i.mercado_id WHERE i.id=?`,[instrumentId]);const i=rs[0];
 if(!i||i.codigo_iso!=='US'||i.moneda!=='USD'||identidadEstructural(i))throw Error('Identidad USA no conciliada');
 const [idProof]:any=await pool.query(`SELECT id FROM capital_identity_evidence WHERE instrumento_id=? AND status='VERIFIED' AND provider='ALPACA' LIMIT 1`,[i.id]);if(!idProof.length)throw Error('Identidad proveedor ALPACA no acreditada');
 const [checkpoint]:any=await pool.query('SELECT cursor_json FROM capital_download_checkpoint WHERE instrumento_id=? AND source=? AND feed=?',[i.id,'ALPACA',feed]);
 const state=checkpoint[0]?(typeof checkpoint[0].cursor_json==='string'?JSON.parse(checkpoint[0].cursor_json):checkpoint[0].cursor_json):null;
 if(state?.start===start&&state?.end===end&&state.complete)return {insertadas:0,completo:true,reutilizado:true};
 let token=state?.start===start&&state?.end===end?state.nextToken:null,count=0,pages=0;
 do{const q=new URLSearchParams({timeframe:'1Day',start,end:end+'T23:59:59Z',adjustment:'all',feed,limit:'1000',sort:'asc'});if(token)q.set('page_token',token);
  const data=await obtenerJson(`https://data.alpaca.markets/v2/stocks/${encodeURIComponent(i.ticker)}/bars?${q}`,{'APCA-API-KEY-ID':process.env.ALPACA_KEY!,'APCA-API-SECRET-KEY':process.env.ALPACA_SECRET!});
  if(!Array.isArray(data.bars))throw Error('Barras Alpaca ausentes');
  for(const b of data.bars){const amount=Number.isFinite(b.vw)&&Number.isFinite(b.v)?b.vw*b.v:null;
   const saved=await guardarObservacion(pool,{instrumentoId:i.id,mercadoId:i.mercado_id,moneda:'USD',fecha:new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(b.t)),cierre:b.c,apertura:b.o,maximo:b.h,minimo:b.l,ajustado:b.c,volumen:b.v,importe:amount,tipoImporte:amount==null?'UNKNOWN':'ESTIMATED',fuente:'ALPACA',feed,obtenido:new Date().toISOString(),ajuste:'ALL',estado:'VALID',evidencia:{adjustment:'all',vwap:b.vw,tradedValue:'Estimación VWAP × volumen, no importe observado',rights: rights.evidence,sourceTimestamp:b.t}});if(saved.inserted)count++;
  }
  token=data.next_page_token??null;pages++;
  await pool.query(`INSERT INTO capital_download_checkpoint(instrumento_id,source,feed,cursor_json) VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE cursor_json=VALUES(cursor_json)`,[i.id,'ALPACA',feed,JSON.stringify({start,end,nextToken:token,complete:!token})]);
  if(token)await new Promise(r=>setTimeout(r,400));
 }while(token&&pages<5);
 return {insertadas:count,completo:!token,paginas:pages,feed};
}
