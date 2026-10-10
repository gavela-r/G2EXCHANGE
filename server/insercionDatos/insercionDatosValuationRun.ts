import conexion from "../conexion/bd";
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { resolverConfiguracionFinanciera } from "../src/valoracion/motorServicio";

// ============================================================================
// INSERTAR VALUATION_RUN
// ============================================================================

async function main() {

    try {

        const empresaId = 1;
        const snapshotId = 2;
        const modelVersionId = 1;

        // Obtener el sector real de la empresa desde MySQL.
        const [empresas] = await conexion.query<RowDataPacket[]>(
            `
            SELECT sector_id
            FROM empresa
            WHERE id = ?
            `,
            [empresaId]
        );

        if (empresas.length !== 1) {
            throw new Error("Empresa inexistente o sin clasificación sectorial.");
        }

        // Resolver la plantilla financiera correspondiente.
        const sectorId = Number(empresas[0].sector_id);

        const {
            templateCode,
            valuationMethodFamily
        } = resolverConfiguracionFinanciera(sectorId);       

        // ====================================================================
        // COMPROBAR QUE EL SNAPSHOT PERTENECE A LA EMPRESA
        // ====================================================================

        const [snapshots] = await conexion.query<RowDataPacket[]>(
            `
            SELECT id
            FROM valuation_input_snapshot
            WHERE id = ?
              AND empresa_id = ?
            `,
            [snapshotId, empresaId]
        );

        if (snapshots.length === 0) {
            throw new Error(
                "El snapshot no existe o no pertenece a la empresa."
            );
        }

        // ====================================================================
        // COMPROBAR QUE EXISTE LA VERSIÓN DEL MODELO
        // ====================================================================

        const [modelos] = await conexion.query<RowDataPacket[]>(
            `
            SELECT id
            FROM model_version
            WHERE id = ?
            `,
            [modelVersionId]
        );

        if (modelos.length === 0) {
            throw new Error(
                "La versión del modelo no existe."
            );
        }

        // ====================================================================
        // EVITAR DUPLICAR UNA EJECUCIÓN EN PREPARACIÓN
        // ====================================================================

        const [runsExistentes] = await conexion.query<RowDataPacket[]>(
            `
            SELECT id
            FROM valuation_run
            WHERE empresa_id = ?
              AND input_snapshot_id = ?
              AND model_version_id = ?
              AND template_code = ?
              AND valuation_method_family = ?
              AND estado = 'PREPARANDO'
            ORDER BY id DESC
            LIMIT 1
            `,
            [
                empresaId,
                snapshotId,
                modelVersionId,
                templateCode,
                valuationMethodFamily
            ]
        );

        if (runsExistentes.length > 0) {
            console.log(
                "Ya existe una valoración en preparación. RUN ID:",
                runsExistentes[0].id
            );
            return;
        }

        // ====================================================================
        // CREAR VALUATION_RUN
        // ====================================================================

        const [resultado] = await conexion.query<ResultSetHeader>(
            `
            INSERT INTO valuation_run (
    empresa_id,
    input_snapshot_id,
    model_version_id,
    template_code,
    valuation_method_family,
    estado
)
VALUES (?, ?, ?, ?, ?, 'PREPARANDO')
            `,
            [
                empresaId,
                snapshotId,
                modelVersionId,
                templateCode,
                valuationMethodFamily
            ]
        );

        console.log("====================================");
        console.log("VALUATION_RUN CREADA CORRECTAMENTE");
        console.log("====================================");
        console.log("RUN ID:", resultado.insertId);
        console.log("Empresa:", empresaId);
        console.log("Snapshot:", snapshotId);
        console.log("Modelo:", modelVersionId);
        console.log("Plantilla:", templateCode);
        console.log("Método:", valuationMethodFamily);
        console.log("Estado: PREPARANDO");

    } catch (error) {

        console.error("ERROR AL CREAR VALUATION_RUN:", error);
        process.exitCode = 1;

    } finally {

        await conexion.end();

    }
}

main();