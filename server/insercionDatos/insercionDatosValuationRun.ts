/** CLI legacy replaced by the atomic valuation service, no fixed IDs and no writes on import. */
import pool from '../conexion/bd';
import { opcionesCli } from '../valoracionAutomatica';
import { ejecutarLote } from '../src/valoracion/lotes';
if(require.main===module)ejecutarLote(pool,opcionesCli()).then(p=>console.log(p)).catch(e=>{console.error(e.message);process.exitCode=1;}).finally(()=>pool.end());
