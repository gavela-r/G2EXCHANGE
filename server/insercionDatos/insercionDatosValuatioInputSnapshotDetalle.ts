import type { Pool, RowDataPacket } from "mysql2/promise";

// ============================================================================
// VINCULAR EJERCICIOS DE VIV AL SNAPSHOT
// ============================================================================

async function vincularEjerciciosAlSnapshot(
    pool: Pool,
    snapshotId: number,
    empresaId: number
): Promise<void> {

    // ========================================================================
    // OBTENER LOS 4 EJERCICIOS ANUALES MÁS RECIENTES, SIN REPETIR AÑO
    // ========================================================================

    const [vivRows] = await pool.query<RowDataPacket[]>(
        `
        SELECT id, fecha_fin_periodo
        FROM (
            SELECT
                id,
                fecha_fin_periodo,
                ROW_NUMBER() OVER (
                    PARTITION BY YEAR(fecha_fin_periodo)
                    ORDER BY fecha_fin_periodo DESC, id DESC
                ) AS rn
            FROM valuation_input_version
            WHERE empresa_id = ?
              AND tipo_periodo = 'ANUAL'
              AND fecha_fin_periodo IS NOT NULL
        ) AS versiones
        WHERE rn = 1
        ORDER BY fecha_fin_periodo DESC
        LIMIT 4
        `,
        [empresaId]
    );

    if (vivRows.length !== 4) {
        throw new Error(
            `Se necesitan 4 ejercicios anuales diferentes. Encontrados: ${vivRows.length}`
        );
    }

    // ========================================================================
    // VINCULAR LOS 4 EJERCICIOS AL SNAPSHOT
    // ========================================================================

    for (let i = 0; i < vivRows.length; i++) {

        await pool.query(
            `
            INSERT INTO valuation_input_snapshot_detalle
            (
                snapshot_id,
                valuation_input_version_id,
                orden_ejercicio
            )
            VALUES (?, ?, ?)
            `,
            [
                snapshotId,
                vivRows[i].id,
                i + 1
            ]
        );

        console.log(
            `[SNAPSHOT ${snapshotId}] Ejercicio ${i + 1}: ` +
            `${vivRows[i].fecha_fin_periodo} ` +
            `(VIV ${vivRows[i].id})`
        );
    }

    console.log(
        `[SNAPSHOT ${snapshotId}] 4 ejercicios anuales vinculados correctamente.`
    );
}

// ============================================================================
// EXPORT
// ============================================================================

export {
    vincularEjerciciosAlSnapshot
};