import { crearSnapshot } from "./insercionDatosValuationInputSnapshot";
import { vincularEjerciciosAlSnapshot } from "./insercionDatosValuationInputSnapshot";
import {Pool} from "mysql2/promise"
 
async function crearSnapshotCompleto(pool: Pool, empresaId: number, fecha: string): Promise<Number> {
    const snapshotId = await crearSnapshot(pool, { empresaId, fechaValoracion: fecha });
    await vincularEjerciciosAlSnapshot(pool, snapshotId, empresaId);

    return snapshotId;
}
// A partir de ahora, usar crearSnapshotCompleto() en vez de crearSnapshot()
export {crearSnapshotCompleto}
// en el flujo de valorarEmpresaCompleto() que ya tienes.