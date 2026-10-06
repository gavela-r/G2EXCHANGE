import type { Pool, RowDataPacket } from "mysql2/promise";

interface RatingResuelto {
    interestCoverage: number;
    syntheticRatingId: number | null;
    syntheticRating: string;
    creditSpread: number;
}

interface RatingRow extends RowDataPacket {
    id: number;
    rating_estimado: string;
    spread_credito: number;
}

interface PrecioRow extends RowDataPacket {
    precio_cierre: number;
    fecha: string;
}

interface KpiRow extends RowDataPacket {
    ebit: number | null;
    gastosFinancieros: number | null;
}

interface CosteCapitalRow extends RowDataPacket {
    id: number;
}

interface SnapshotInput {
    empresaId: number;
    fechaValoracion: string;
}


/**
 * Resolver el rating de crédito a partir de la cobertura de intereses
 */
async function resolveCreditSpread(
    pool: Pool,
    ebit: number,
    gastosFinancieros: number
): Promise<RatingResuelto> {

    const interestCoverage =
        gastosFinancieros !== 0
            ? ebit / gastosFinancieros
            : 999;

    const [rows] = await pool.query<RatingRow[]>(
        `SELECT id, rating_estimado, spread_credito
         FROM rating_sintetico
         WHERE ? BETWEEN cobertura_intereses_min AND cobertura_intereses_max
         LIMIT 1`,
        [interestCoverage]
    );

    if (rows.length === 0) {
        throw new Error(
            `Sin tramo de rating para cobertura=${interestCoverage}`
        );
    }

    return {
        interestCoverage,
        syntheticRatingId: rows[0].id,
        syntheticRating: rows[0].rating_estimado,
        creditSpread: rows[0].spread_credito,
    };
}


/**
 * Crear el snapshot de valoración
 */
async function crearSnapshot(
    pool: Pool,
    input: SnapshotInput
): Promise<number> {

    const {
        empresaId,
        fechaValoracion
    } = input;


    // 1. Precio más reciente del instrumento principal de la empresa

    const [precioRows] = await pool.query<PrecioRow[]>(
        `SELECT cd.precio_cierre, cd.fecha
        FROM cotizacion_diaria cd
        JOIN instrumento i ON i.id = cd.instrumento_id
        WHERE i.empresa_id = ?
        ORDER BY cd.fecha DESC
        LIMIT 1`,
        [empresaId]
    );

    if (precioRows.length === 0) {
        throw new Error(
            "Sin cotizacion disponible para esta empresa"
        );
    }


    // 2. EBIT y gastos financieros del último ejercicio disponible

    const [kpiRows] = await pool.query<KpiRow[]>(
        `SELECT
            MAX(
                CASE
                    WHEN pcv.concepto = 'ebit'
                    THEN pcv.importe
                END
            ) AS ebit,

            MAX(
                CASE
                    WHEN pcv.concepto = 'gastos_financieros'
                    THEN pcv.importe
                END
            ) AS gastosFinancieros

         FROM partida_contable_valor pcv

         JOIN informe_financiero inf
             ON inf.id = pcv.informe_id

         WHERE inf.empresa_id = ?

         ORDER BY inf.fecha_fin_periodo DESC

         LIMIT 1`,
        [empresaId]
    );

    const {
        ebit,
        gastosFinancieros
    } = kpiRows[0];


    if (ebit === null || gastosFinancieros === null) {
        throw new Error(
            "Sin EBIT o gastos financieros disponibles para esta empresa"
        );
    }


    // Resolver rating de crédito

    const rating = await resolveCreditSpread(
        pool,
        ebit,
        gastosFinancieros
    );


    // 3. Coste de capital de referencia (sector + país de la empresa)

    const [costeCapitalRows] =
        await pool.query<CosteCapitalRow[]>(
            `SELECT ccr.id
             FROM coste_capital_referencia ccr

             JOIN empresa e
                 ON e.sector_id = ccr.sector_id
                AND e.pais_id = ccr.pais_id

             WHERE e.id = ?

             ORDER BY ccr.fecha_calculo DESC

             LIMIT 1`,
            [empresaId]
        );


    if (costeCapitalRows.length === 0) {
        throw new Error(
            "Sin COSTE_CAPITAL_REFERENCIA para el sector+país de esta empresa"
        );
    }


    // 4. Insertar el snapshot

    const [result] = await pool.query(
        `INSERT INTO valuation_input_snapshot
        (
            empresa_id,
            fecha_valoracion,
            precio_usado,
            fecha_precio,
            coste_capital_id,
            rating_sintetico_id,
            interest_coverage,
            synthetic_rating,
            credit_spread,
            reporting_currency,
            valuation_currency,
            fx_rate_used
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'USD', 'USD', 1.0)`,
        [
            empresaId,
            fechaValoracion,
            precioRows[0].precio_cierre,
            precioRows[0].fecha,
            costeCapitalRows[0].id,
            rating.syntheticRatingId,
            rating.interestCoverage,
            rating.syntheticRating,
            rating.creditSpread
        ]
    );


    return (result as { insertId: number }).insertId;
}

async function vincularEjerciciosAlSnapshot(pool: Pool,
snapshotId: number,
empresaId: number
): Promise<void> {
// Los hasta 4 ejercicios mas recientes de la empresa
const [vivRows] = await pool.query<RowDataPacket[]>(
`SELECT id FROM valuation_input_version
WHERE empresa_id = ?
ORDER BY ejercicio_fiscal DESC
LIMIT 4`,
[empresaId]
);
if (vivRows.length === 0) {
throw new Error("Sin ejercicios (VALUATION_INPUT_VERSION) para esta empresa");
}
for (let i = 0; i < vivRows.length; i++) {
await pool.query(
`INSERT INTO valuation_input_snapshot_detalle
(snapshot_id, valuation_input_version_id, orden_ejercicio)
VALUES (?, ?, ?)`,
[snapshotId, vivRows[i].id, i + 1] // 1 = mas reciente
);
}
}

export {
    resolveCreditSpread,
    crearSnapshot,
    vincularEjerciciosAlSnapshot
};