import { crearSnapshotCompleto } from "./insercionaDatosValuationInputSnapshotCompleto";
import pool from "../conexion/bd";

async function main() {

    // COMPROBAR A QUÉ BASE DE DATOS ESTÁ CONECTADO NODE
    const [dbActual]: any = await pool.query(`
        SELECT DATABASE() AS base_datos
    `);

    console.log(
        "BASE DE DATOS USADA POR NODE:",
        dbActual[0].base_datos
    );

    // COMPROBAR COLUMNAS REALES QUE VE NODE
    const [columnas]: any = await pool.query(`
        SHOW COLUMNS FROM rating_sintetico
    `);

    console.log(
        "COLUMNAS RATING_SINTETICO:",
        columnas.map((x: any) => x.Field)
    );

    const snapshotId = await crearSnapshotCompleto(
        pool,
        1,
        "2026-10-07"
    );

    console.log("Snapshot creado:", snapshotId);
}

main();