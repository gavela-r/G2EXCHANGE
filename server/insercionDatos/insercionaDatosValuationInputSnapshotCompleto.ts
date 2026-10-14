import type { PoolConnection } from 'mysql2/promise';
import type { Preparado } from '../src/valoracion/datos';
import { crearSnapshot,vincularEjerciciosAlSnapshot } from './insercionDatosValuationInputSnapshot';
/** Must run inside the transaction that also creates the RUN and immutable evidence. */
export async function crearSnapshotCompleto(conn:PoolConnection,p:Preparado):Promise<number> {
    const id=await crearSnapshot(conn,p);
    await vincularEjerciciosAlSnapshot(conn,id,p);
    return id;
}
