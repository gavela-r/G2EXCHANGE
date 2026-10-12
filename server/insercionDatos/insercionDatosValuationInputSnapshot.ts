import type { PoolConnection, RowDataPacket, ResultSetHeader } from 'mysql2/promise';
import type { Preparado, PerfilRating } from '../src/valoracion/datos';
import { resolverRating } from '../src/valoracion/datos';
export async function resolveCreditSpread(conn:Pick<PoolConnection,'query'>,ebit:number,intereses:number,perfil:PerfilRating,fecha:string) { return resolverRating(conn,ebit,intereses,perfil,fecha); }
/** Transaction ownership belongs to the orchestration service. Never chooses a different instrument. */
export async function crearSnapshot(conn:PoolConnection,p:Preparado):Promise<number> {
 const i=p.input;
 if(Number(i.instrument_id)!==p.instrumento.instrumento_id||Number(i.company_id)!==p.instrumento.empresa_id)throw new Error('Identidad del snapshot inconsistente');
 const [s]=await conn.query<ResultSetHeader>(`INSERT INTO valuation_input_snapshot (empresa_id,fecha_valoracion,precio_usado,fecha_precio,coste_capital_id,rating_sintetico_id,interest_coverage,synthetic_rating,credit_spread,reporting_currency,valuation_currency,fx_rate_used) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,[i.company_id,i.valuation_date,i.price_per_share,(p.trace.quote as any).fecha,p.costeCapitalId,p.ratingId,i.interest_coverage??null,i.synthetic_rating??null,i.credit_spread*100,i.reporting_currency,i.valuation_currency,i.fx_rate_used]);
 return s.insertId;
}
export async function vincularEjerciciosAlSnapshot(conn:PoolConnection,snapshotId:number,p:Preparado):Promise<void> {
 if(p.versiones.length!==4||new Set(p.versiones).size!==4)throw new Error('Cuatro versiones únicas obligatorias');
 const [snap]=await conn.query<RowDataPacket[]>('SELECT empresa_id FROM valuation_input_snapshot WHERE id=?',[snapshotId]);
 if(snap.length!==1||Number(snap[0].empresa_id)!==p.instrumento.empresa_id)throw new Error('Snapshot de otra empresa');
 for(let n=0;n<4;n++){const [v]=await conn.query<RowDataPacket[]>('SELECT empresa_id FROM valuation_input_version WHERE id=?',[p.versiones[n]]);if(v.length!==1||Number(v[0].empresa_id)!==p.instrumento.empresa_id)throw new Error('Versión de otra empresa');await conn.query('INSERT INTO valuation_input_snapshot_detalle (snapshot_id,valuation_input_version_id,orden_ejercicio) VALUES (?,?,?)',[snapshotId,p.versiones[n],n+1]);}
}
