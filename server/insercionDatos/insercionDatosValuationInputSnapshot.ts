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

    const db = pool as any;

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


    // ============================================================================
// 2. EBIT Y GASTOS FINANCIEROS DEL ÚLTIMO INFORME ANUAL DISPONIBLE
// ============================================================================
const [kpiRows]: any = await db.query(
    `
    SELECT
        inf.id AS informe_id,
        inf.fecha_fin_periodo,

        MAX(
            CASE
                WHEN UPPER(tc.concepto_estandar) = 'EBIT'
                THEN pcv.importe
            END
        ) AS ebit,

        MAX(
            CASE
                WHEN UPPER(tc.concepto_estandar) IN (
                    'GASTO_INTERESES',
                    'GASTOS_FINANCIEROS'
                )
                THEN pcv.importe
            END
        ) AS gastosFinancieros

    FROM informe_financiero inf

    JOIN partida_contable_valor pcv
        ON pcv.informe_id = inf.id

    JOIN taxonomia_concepto tc
        ON tc.id = pcv.concepto_estandar_id

    WHERE inf.empresa_id = ?
      AND inf.tipo_periodo = 'ANUAL'

    GROUP BY
        inf.id,
        inf.fecha_fin_periodo

    HAVING
        ebit IS NOT NULL
        AND gastosFinancieros IS NOT NULL

    ORDER BY inf.fecha_fin_periodo DESC

    LIMIT 1
    `,
    [empresaId]
);

if (kpiRows.length === 0) {
    throw new Error(
        `Sin ejercicio anual con EBIT + gastos financieros para empresa ${empresaId}`
    );
}

const ebit = Number(kpiRows[0].ebit);
const gastosFinancieros = Number(kpiRows[0].gastosFinancieros);

console.log(
    `[SNAPSHOT] Empresa ${empresaId} | ` +
    `Informe rating ${kpiRows[0].informe_id} | ` +
    `Fecha ${kpiRows[0].fecha_fin_periodo} | ` +
    `EBIT=${ebit} | Intereses=${gastosFinancieros}`
);

// ============================================================================
// RESOLVER RATING DE CRÉDITO
// ============================================================================

const rating = await resolveCreditSpread(
    pool,
    ebit,
    gastosFinancieros
);


    // Resolver rating de crédito

  async function resolveCreditSpread(
    pool: Pool,
    ebit: number,
    gastosFinancieros: number
): Promise<RatingResuelto> {

    const interestCoverage =
        gastosFinancieros !== 0
            ? ebit / Math.abs(gastosFinancieros)
            : 999;

const [rows] = await pool.query<RatingRow[]>(
    `
    SELECT
        id,
        rating_estimado,
        spread_credito_base AS spread_credito
    FROM rating_sintetico
   WHERE ? > conbertura_interes_min_exclusiva
  AND ? <= cobertura_interes_max_inclusiva
      AND activo = 1
    ORDER BY orden_riesgo ASC
    LIMIT 1
    `,
    [
        interestCoverage,
        interestCoverage
    ]
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
        creditSpread: Number(rows[0].spread_credito)
    };
}


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

async function vincularEjerciciosAlSnapshot(
    pool: Pool,
    snapshotId: number,
    empresaId: number
): Promise<void> {

    // =====================================================
    // 1. OBTENER LOS 4 EJERCICIOS ANUALES MÁS RECIENTES
    //    SIN REPETIR AÑOS
    // =====================================================

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
                ) AS numero_version
            FROM valuation_input_version
            WHERE empresa_id = ?
              AND tipo_periodo = 'ANUAL'
        ) AS versiones
        WHERE numero_version = 1
        ORDER BY fecha_fin_periodo DESC, id DESC
        LIMIT 4
        `,
        [empresaId]
    );

    if (vivRows.length === 0) {
        throw new Error(
            `Sin ejercicios anuales disponibles para empresa ${empresaId}`
        );
    }

    // =====================================================
    // 2. COMPROBAR SI EL SNAPSHOT YA TIENE VINCULACIONES
    // =====================================================

    const [existentes] = await pool.query<RowDataPacket[]>(
        `
        SELECT COUNT(*) AS total
        FROM valuation_input_snapshot_detalle
        WHERE snapshot_id = ?
        `,
        [snapshotId]
    );

    if (Number(existentes[0].total) > 0) {
        throw new Error(
            `El snapshot ${snapshotId} ya tiene ejercicios vinculados. ` +
            `No se modifican para preservar su histórico.`
        );
    }

    // =====================================================
    // 3. VINCULAR LOS EJERCICIOS EN ORDEN CRONOLÓGICO
    // =====================================================

    for (let i = 0; i < vivRows.length; i++) {

        await pool.query(
            `
            INSERT INTO valuation_input_snapshot_detalle (
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
            `[SNAPSHOT ${snapshotId}] ` +
            `Ejercicio ${i + 1}: ` +
            `${vivRows[i].fecha_fin_periodo} ` +
            `(VIV ${vivRows[i].id})`
        );
    }

    console.log(
        `[SNAPSHOT ${snapshotId}] ` +
        `${vivRows.length} ejercicios anuales vinculados correctamente.`
    );
}

export {
    resolveCreditSpread,
    crearSnapshot,
    vincularEjerciciosAlSnapshot
};