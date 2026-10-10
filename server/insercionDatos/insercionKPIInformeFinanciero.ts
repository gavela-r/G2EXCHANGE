//
// Si el archivo ya tiene estos imports, NO repetir:
//
import { Request, Response } from "express";
import conexion from "../conexion/bd";
//
// ============================================================================


// ============================================================================
// 2. TIPOS
// ============================================================================

interface KpiInformeBase {

    informe_id: number;

    empresa_id: number;

    fuente: string;

    tipo_periodo: string;

    fecha_fin_periodo: string | null;
}


interface KpiPartidas {

    INGRESOS?: number;

    BENEFICIO_BRUTO?: number;

    EBIT?: number;

    BENEFICIO_NETO?: number;

    GASTO_INTERESES?: number;

    EFECTIVO?: number;

    ACTIVOS_TOTALES?: number;

    PASIVOS_TOTALES?: number;

    PATRIMONIO_NETO?: number;

    DEUDA_CORTO_PLAZO?: number;

    DEUDA_LARGO_PLAZO?: number;

    FLUJO_CAJA_OPERATIVO?: number;

    CAPEX?: number;

    DEPRECIACION_AMORTIZACION?: number;

    INVENTARIOS?: number;

    CUENTAS_COBRAR?: number;

    CUENTAS_PAGAR?: number;
}


interface KpiCalculado {

    informeId: number;

    kpi: string;

    valor: number | null;

    unidad: string;

    nivelConfianza: "ALTA" | "MEDIA";
}


// ============================================================================
// 3. UTILIDADES
// ============================================================================

function kpiNumero(
    valor: unknown
): number | null {

    const numero =
        Number(valor);

    return Number.isFinite(numero)
        ? numero
        : null;
}


function kpiDivision(
    numerador: number | undefined,
    denominador: number | undefined
): number | null {

    if (
        numerador === undefined ||
        denominador === undefined ||
        denominador === 0
    ) {

        return null;
    }

    const valor =
        numerador /
        denominador;

    return Number.isFinite(valor)
        ? valor
        : null;
}


function kpiSuma(
    ...valores:
        (number | undefined)[]
): number | null {

    const presentes =
        valores.filter(
            v =>
                v !== undefined
        ) as number[];

    if (
        presentes.length === 0
    ) {

        return null;
    }

    const resultado =
        presentes.reduce(
            (a, b) =>
                a + b,
            0
        );

    return Number.isFinite(resultado)
        ? resultado
        : null;
}


function kpiResta(
    a: number | undefined,
    b: number | undefined
): number | null {

    if (
        a === undefined ||
        b === undefined
    ) {

        return null;
    }

    const resultado =
        a - b;

    return Number.isFinite(resultado)
        ? resultado
        : null;
}


function kpiPorcentaje(
    valor: number | null
): number | null {

    if (
        valor === null
    ) {

        return null;
    }

    return valor * 100;
}


// ============================================================================
// 4. CARGAR INFORMES CON PARTIDAS
// ============================================================================
//
// Solo informes que tengan al menos una PARTIDA_CONTABLE_VALOR.
//
// ============================================================================

async function kpiCargarInformes():
Promise<KpiInformeBase[]> {

    const db =
        conexion as any;

    const [rows]:
        any =
        await db.query(
        `
        SELECT DISTINCT

            inf.id AS informe_id,

            inf.empresa_id,

            inf.fuente,

            inf.tipo_periodo,

            inf.fecha_fin_periodo

        FROM informe_financiero inf

        INNER JOIN partida_contable_valor pcv
            ON pcv.informe_id =
               inf.id

        ORDER BY
            inf.id
        `
    );

    return rows.map(
        (row: any) => ({

            informe_id:
                Number(
                    row.informe_id
                ),

            empresa_id:
                Number(
                    row.empresa_id
                ),

            fuente:
                String(
                    row.fuente ||
                    ""
                ),

            tipo_periodo:
                String(
                    row.tipo_periodo ||
                    ""
                ),

            fecha_fin_periodo:
                row.fecha_fin_periodo
                    ?
                    String(
                        row.fecha_fin_periodo
                    )
                    :
                    null
        })
    );
}


// ============================================================================
// 5. CARGAR PARTIDAS NORMALIZADAS DE UN INFORME
// ============================================================================

export async function kpiCargarPartidas(
    informeId: number
): Promise<KpiPartidas> {

    const db =
        conexion as any;

    const [rows]:
        any =
        await db.query(
        `
        SELECT

            tc.concepto_estandar,

            pcv.importe

        FROM partida_contable_valor pcv

        INNER JOIN taxonomia_concepto tc
            ON tc.id =
               pcv.concepto_estandar_id

        WHERE
            pcv.informe_id = ?
        `,
        [
            informeId
        ]
    );

    const partidas:
        KpiPartidas =
        {};

    for (
        const row
        of rows
    ) {

        const concepto =
            String(
                row.concepto_estandar ||
                ""
            )
            .trim()
            .toUpperCase();

        const importe =
            kpiNumero(
                row.importe
            );

        if (
            importe === null
        ) {

            continue;
        }

        (partidas as any)[
            concepto
        ] = importe;
    }

    return partidas;
}


// ============================================================================
// 6. CALCULO KPI
// ============================================================================
//
// KPI calculados:
//
// - MARGEN_BRUTO
// - MARGEN_EBIT
// - MARGEN_NETO
// - ROA
// - ROE
// - DEUDA_TOTAL
// - DEUDA_NETA
// - DEUDA_SOBRE_PATRIMONIO
// - DEUDA_SOBRE_ACTIVOS
// - COBERTURA_INTERESES
// - EBITDA
// - MARGEN_EBITDA
// - FCF
// - MARGEN_FCF
// - CAPITAL_CIRCULANTE_OPERATIVO
// - CAPITAL_CIRCULANTE_OPERATIVO_SOBRE_INGRESOS
// - PASIVO_SOBRE_ACTIVOS
//
// ============================================================================

export function kpiCalcularInforme(
    informeId: number,
    p: KpiPartidas
): KpiCalculado[] {

    const resultado:
        KpiCalculado[] =
        [];


    function push(
        kpi: string,
        valor: number | null,
        unidad: string,
        confianza:
            "ALTA" |
            "MEDIA" =
            "ALTA"
    ) {

        if (
            valor === null ||
            !Number.isFinite(valor)
        ) {

            return;
        }

        resultado.push({

            informeId,

            kpi,

            valor,

            unidad,

            nivelConfianza:
                confianza
        });
    }


    // ========================================================================
    // MARGEN BRUTO
    // ========================================================================

    push(
        "MARGEN_BRUTO",
        kpiPorcentaje(
            kpiDivision(
                p.BENEFICIO_BRUTO,
                p.INGRESOS
            )
        ),
        "PORCENTAJE"
    );


    // ========================================================================
    // MARGEN EBIT
    // ========================================================================

    push(
        "MARGEN_EBIT",
        kpiPorcentaje(
            kpiDivision(
                p.EBIT,
                p.INGRESOS
            )
        ),
        "PORCENTAJE"
    );


    // ========================================================================
    // MARGEN NETO
    // ========================================================================

    push(
        "MARGEN_NETO",
        kpiPorcentaje(
            kpiDivision(
                p.BENEFICIO_NETO,
                p.INGRESOS
            )
        ),
        "PORCENTAJE"
    );


    // ========================================================================
    // ROA
    // ========================================================================

    push(
        "ROA",
        kpiPorcentaje(
            kpiDivision(
                p.BENEFICIO_NETO,
                p.ACTIVOS_TOTALES
            )
        ),
        "PORCENTAJE"
    );


    // ========================================================================
    // ROE
    // ========================================================================

    push(
        "ROE",
        kpiPorcentaje(
            kpiDivision(
                p.BENEFICIO_NETO,
                p.PATRIMONIO_NETO
            )
        ),
        "PORCENTAJE"
    );


    // ========================================================================
    // DEUDA TOTAL
    // ========================================================================

    const deudaTotal =
        kpiSuma(
            p.DEUDA_CORTO_PLAZO,
            p.DEUDA_LARGO_PLAZO
        );

    push(
        "DEUDA_TOTAL",
        deudaTotal,
        "MONEDA"
    );


    // ========================================================================
    // DEUDA NETA
    // ========================================================================

    const deudaNeta =
        deudaTotal !== null &&
        p.EFECTIVO !== undefined
            ?
            deudaTotal -
            p.EFECTIVO
            :
            null;

    push(
        "DEUDA_NETA",
        deudaNeta,
        "MONEDA"
    );


    // ========================================================================
    // DEUDA / PATRIMONIO
    // ========================================================================

    push(
        "DEUDA_SOBRE_PATRIMONIO",
        deudaTotal !== null
            ?
            kpiPorcentaje(
                kpiDivision(
                    deudaTotal,
                    p.PATRIMONIO_NETO
                )
            )
            :
            null,
        "PORCENTAJE"
    );


    // ========================================================================
    // DEUDA / ACTIVOS
    // ========================================================================

    push(
        "DEUDA_SOBRE_ACTIVOS",
        deudaTotal !== null
            ?
            kpiPorcentaje(
                kpiDivision(
                    deudaTotal,
                    p.ACTIVOS_TOTALES
                )
            )
            :
            null,
        "PORCENTAJE"
    );


    // ========================================================================
    // COBERTURA DE INTERESES
    //
    // Esta es la KPI que alimenta despues:
    //
    // COBERTURA_INTERESES
    //      ↓
    // RATING_SINTETICO
    //      ↓
    // SPREAD_CREDITO
    //
    // ========================================================================

    if (
        p.GASTO_INTERESES !== undefined &&
        p.GASTO_INTERESES !== 0 &&
        p.EBIT !== undefined
    ) {

        // Algunas taxonomias pueden presentar el gasto de intereses
        // como negativo.
        //
        // Para cobertura usamos valor absoluto del denominador.

        const gastoIntereses =
            Math.abs(
                p.GASTO_INTERESES
            );

        push(
            "COBERTURA_INTERESES",
            kpiDivision(
                p.EBIT,
                gastoIntereses
            ),
            "VECES"
        );
    }


    // ========================================================================
    // EBITDA
    //
    // EBITDA = EBIT + D&A
    //
    // ========================================================================

    const ebitda =
        (
            p.EBIT !== undefined &&
            p.DEPRECIACION_AMORTIZACION !== undefined
        )
            ?
            p.EBIT +
            Math.abs(
                p.DEPRECIACION_AMORTIZACION
            )
            :
            null;

    push(
        "EBITDA",
        ebitda,
        "MONEDA",
        "MEDIA"
    );


    // ========================================================================
    // MARGEN EBITDA
    // ========================================================================

    push(
        "MARGEN_EBITDA",
        ebitda !== null
            ?
            kpiPorcentaje(
                kpiDivision(
                    ebitda,
                    p.INGRESOS
                )
            )
            :
            null,
        "PORCENTAJE",
        "MEDIA"
    );


    // ========================================================================
    // FREE CASH FLOW
    //
    // FCF = CFO - CAPEX
    //
    // CAPEX puede llegar positivo o negativo dependiendo de la fuente.
    // En nuestra taxonomia debe representar gasto/inversion.
    // Usamos valor absoluto para evitar sumar CAPEX por signo de origen.
    //
    // ========================================================================

    const fcf =
        (
            p.FLUJO_CAJA_OPERATIVO !== undefined &&
            p.CAPEX !== undefined
        )
            ?
            p.FLUJO_CAJA_OPERATIVO -
            Math.abs(
                p.CAPEX
            )
            :
            null;

    push(
        "FCF",
        fcf,
        "MONEDA"
    );


    // ========================================================================
    // MARGEN FCF
    // ========================================================================

    push(
        "MARGEN_FCF",
        fcf !== null
            ?
            kpiPorcentaje(
                kpiDivision(
                    fcf,
                    p.INGRESOS
                )
            )
            :
            null,
        "PORCENTAJE"
    );


    // ========================================================================
    // CAPITAL CIRCULANTE OPERATIVO
    //
    // NWC operativo simplificado:
    //
    // Inventarios
    // + Cuentas a cobrar
    // - Cuentas a pagar
    //
    // ========================================================================

    const capitalCirculante =
        (
            p.INVENTARIOS !== undefined &&
            p.CUENTAS_COBRAR !== undefined &&
            p.CUENTAS_PAGAR !== undefined
        )
            ?
            p.INVENTARIOS +
            p.CUENTAS_COBRAR -
            p.CUENTAS_PAGAR
            :
            null;

    push(
        "CAPITAL_CIRCULANTE_OPERATIVO",
        capitalCirculante,
        "MONEDA"
    );


    // ========================================================================
    // CAPITAL CIRCULANTE / INGRESOS
    // ========================================================================

    push(
        "CAPITAL_CIRCULANTE_OPERATIVO_SOBRE_INGRESOS",
        capitalCirculante !== null
            ?
            kpiPorcentaje(
                kpiDivision(
                    capitalCirculante,
                    p.INGRESOS
                )
            )
            :
            null,
        "PORCENTAJE"
    );


    // ========================================================================
    // PASIVO / ACTIVOS
    // ========================================================================

    push(
        "PASIVO_SOBRE_ACTIVOS",
        kpiPorcentaje(
            kpiDivision(
                p.PASIVOS_TOTALES,
                p.ACTIVOS_TOTALES
            )
        ),
        "PORCENTAJE"
    );


    return resultado;
}


// ============================================================================
// 7. GUARDAR KPI
// ============================================================================

export async function kpiGuardar(
    kpis:
        KpiCalculado[]
): Promise<number> {

    if (
        kpis.length === 0
    ) {

        return 0;
    }

    const db =
        conexion as any;

    const valores =
        kpis.map(
            k => [

                k.informeId,

                k.kpi,

                k.valor,

                k.unidad,

                k.nivelConfianza
            ]
        );

    const [resultado]:
        any =
        await db.query(
        `
        INSERT INTO
            kpi_financiero_informe
        (
            informe_id,

            kpi,

            valor,

            unidad,

            nivel_confianza
        )

        VALUES ?

        ON DUPLICATE KEY UPDATE

            valor =
                VALUES(valor),

            unidad =
                VALUES(unidad),

            nivel_confianza =
                VALUES(nivel_confianza),

            fecha_calculo =
                CURRENT_TIMESTAMP
        `,
        [
            valores
        ]
    );

    return Number(
        resultado?.affectedRows ||
        valores.length
    );
}


// ============================================================================
// 8. MOTOR PRINCIPAL UNIVERSAL
// ============================================================================

export async function
ejecutarCalculoKpiFinancieroInforme() {

    const inicio =
        Date.now();

    console.log(
        "\n======================================================"
    );

    console.log(
        " KPI_FINANCIERO_INFORME - UNIVERSAL"
    );

    console.log(
        " USA + JAPON + TAIWAN"
    );

    console.log(
        "======================================================"
    );


    const informes =
        await kpiCargarInformes();


    console.log(
        `[KPI] Informes con partidas: ` +
        `${informes.length}`
    );


    let procesados =
        0;

    let sinKpi =
        0;

    let errores =
        0;

    let kpisCalculados =
        0;

    let operacionesBD =
        0;


    const porFuente:
        Record<string, number> =
        {};


    for (
        const informe
        of informes
    ) {

        try {

            const partidas =
                await kpiCargarPartidas(
                    informe.informe_id
                );


            const kpis =
                kpiCalcularInforme(
                    informe.informe_id,
                    partidas
                );


            if (
                kpis.length ===
                0
            ) {

                sinKpi++;

            } else {

                kpisCalculados +=
                    kpis.length;


                operacionesBD +=
                    await kpiGuardar(
                        kpis
                    );
            }


            procesados++;


            const fuente =
                informe.fuente ||
                "SIN_FUENTE";


            porFuente[
                fuente
            ] =
                (
                    porFuente[
                        fuente
                    ] ||
                    0
                ) +
                1;


            if (
                procesados %
                500 ===
                0
            ) {

                console.log(

                    `[KPI] Informes ` +
                    `${procesados}/` +
                    `${informes.length}` +

                    ` | KPI: ` +
                    `${kpisCalculados}` +

                    ` | sin KPI: ` +
                    `${sinKpi}` +

                    ` | errores: ` +
                    `${errores}`
                );
            }


        } catch (error) {

            errores++;


            console.error(
                `[KPI] Error informe ` +
                `${informe.informe_id}:`,
                error instanceof Error
                    ?
                    error.message
                    :
                    String(error)
            );
        }
    }


    const duracionMs =
        Date.now() -
        inicio;


    console.log(
        "\n[KPI] RESUMEN FINAL"
    );


    console.log(
        `- Informes disponibles: ` +
        `${informes.length}`
    );


    console.log(
        `- Informes procesados: ` +
        `${procesados}`
    );


    console.log(
        `- Informes sin KPI: ` +
        `${sinKpi}`
    );


    console.log(
        `- Errores: ` +
        `${errores}`
    );


    console.log(
        `- KPI calculados: ` +
        `${kpisCalculados}`
    );


    console.log(
        `- Operaciones BD: ` +
        `${operacionesBD}`
    );


    console.log(
        `- Fuentes:`,
        porFuente
    );


    console.log(
        `- Tiempo total: ` +
        `${(
            duracionMs /
            1000
        ).toFixed(1)} s`
    );


    return {

        informes:
            informes.length,

        procesados,

        sinKpi,

        errores,

        kpisCalculados,

        operacionesBD,

        porFuente,

        duracionMs
    };
}


// ============================================================================
// 9. ENDPOINT EXPRESS
// ============================================================================
//
// POST:
//
// /api/kpi-financiero-informe/actualizar
//
// ============================================================================

export async function
actualizarKpiFinancieroInforme(
    _req: Request,
    res: Response
): Promise<void> {

    try {

        const resultado =
            await ejecutarCalculoKpiFinancieroInforme();


        res.status(
            200
        ).json({

            ok:
                true,

            mensaje:
                "Calculo KPI_FINANCIERO_INFORME finalizado.",

            resumen:
                resultado
        });


    } catch (error) {

        console.error(
            "[KPI] ERROR CRITICO:",
            error
        );


        res.status(
            500
        ).json({

            ok:
                false,

            mensaje:
                "No se pudo calcular KPI_FINANCIERO_INFORME.",

            error:
                error instanceof Error
                    ?
                    error.message
                    :
                    String(error)
        });
    }
}


// ============================================================================
// 10. EJECUCION DIRECTA
// ============================================================================
//
// Para ejecutar:
//
// npx ts-node insercionKpiFinancieroInforme.ts
//
// ============================================================================

ejecutarCalculoKpiFinancieroInforme()

    .then(
        resultado => {

            console.log(
                "\n=== KPI_FINANCIERO_INFORME FINALIZADO ==="
            );


            console.log(
                resultado
            );
        }
    )

    .catch(
        error => {

            console.error(
                "\n=== ERROR CRITICO KPI_FINANCIERO_INFORME ===",
                error
            );


            process.exitCode =
                1;
        }
    );


// ============================================================================
// 11. KPI CALCULADOS
// ============================================================================
//
// MARGEN_BRUTO
// MARGEN_EBIT
// MARGEN_NETO
// ROA
// ROE
// DEUDA_TOTAL
// DEUDA_NETA
// DEUDA_SOBRE_PATRIMONIO
// DEUDA_SOBRE_ACTIVOS
// COBERTURA_INTERESES
// EBITDA
// MARGEN_EBITDA
// FCF
// MARGEN_FCF
// CAPITAL_CIRCULANTE_OPERATIVO
// CAPITAL_CIRCULANTE_OPERATIVO_SOBRE_INGRESOS
// PASIVO_SOBRE_ACTIVOS
//
// ============================================================================


// ============================================================================
// 12. FLUJO COMPLETO DEL SISTEMA
// ============================================================================
//
// USA
// SEC
//   ↓
//
// JAPON
// EDINET
//   ↓
//
// TAIWAN
// FINMIND
//   ↓
//
// INFORME_FINANCIERO
//   ↓
// PARTIDA_CONTABLE_VALOR
//   ↓
// TAXONOMIA_CONCEPTO
//   ↓
// KPI_FINANCIERO_INFORME   ← ESTE SCRIPT
//   ↓
// COBERTURA_INTERESES
//   ↓
// RATING_SINTETICO
//   ↓
// SPREAD_CREDITO
//   ↓
// VALUATION_RUN
//
// ============================================================================


// ============================================================================
// 13. NOTAS DE DISEÑO
// ============================================================================
//
// 1. ESTE ENDPOINT ES UNIVERSAL.
//
// No contiene:
//
// if pais == USA
// if pais == JP
// if pais == TW
//
// No los necesita.
//
// Cuando las partidas llegan normalizadas,
// las formulas financieras son iguales.
//
// ---------------------------------------------------------------------------
//
// 2. KPI NO DISPONIBLE = NO INSERTAR.
//
// Si faltan datos necesarios:
// - no inventamos,
// - no ponemos cero,
// - no dividimos entre cero.
//
// Simplemente no se genera ese KPI.
//
// ---------------------------------------------------------------------------
//
// 3. NIVEL DE CONFIANZA.
//
// KPI directamente calculados de conceptos normalizados:
//     ALTA
//
// EBITDA/MARGEN EBITDA:
//     MEDIA
//
// porque dependen de la calidad del mapping de D&A.
//
// ---------------------------------------------------------------------------
//
// 4. ROA/ROE.
//
// Esta primera version usa:
//     beneficio neto / activos cierre
//     beneficio neto / patrimonio cierre
//
// En una version posterior, para maxima precision, se puede usar:
//     activos medios
//     patrimonio medio
//
// entre periodo anterior y actual.
//
// ---------------------------------------------------------------------------
//
// 5. DEUDA TOTAL.
//
// Actualmente:
//
// DEUDA_CP + DEUDA_LP
//
// Si una empresa tiene deuda adicional no capturada por esos dos conceptos,
// la taxonomia se ampliara posteriormente.
//
// ---------------------------------------------------------------------------
//
// 6. COBERTURA DE INTERESES.
//
// EBIT / ABS(GASTO_INTERESES)
//
// Esta KPI es especialmente importante porque alimenta directamente:
//
// RATING_SINTETICO
//
// ---------------------------------------------------------------------------
//
// 7. FCF.
//
// CFO - ABS(CAPEX)
//
// Esta es una definicion operativa estandar de FCF.
//
// ---------------------------------------------------------------------------
//
// 8. CAPITAL CIRCULANTE OPERATIVO.
//
// INVENTARIOS
// + CUENTAS_COBRAR
// - CUENTAS_PAGAR
//
// No incluye caja ni deuda financiera.
//
// ---------------------------------------------------------------------------
//
// 9. SIGUIENTE PASO.
//
// Una vez esta tabla funcione:
//
// KPI_FINANCIERO_INFORME
//       ↓
// RATING_SINTETICO
//
// Ahi podremos automatizar:
//
// COBERTURA_INTERESES
//       ↓
// clasificacion de rating sintetico
//       ↓
// spread credito
//
// ============================================================================
