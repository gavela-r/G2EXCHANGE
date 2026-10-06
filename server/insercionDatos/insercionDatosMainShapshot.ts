import { crearSnapshotCompleto } from "./insercionaDatosValuationInputSnapshotCompleto";
import pool from "../conexion/bd";

async function main() {
  const snapshotId = await crearSnapshotCompleto(pool, 1, "2026-10-02");
  console.log("Snapshot creado:", snapshotId);
}

main();