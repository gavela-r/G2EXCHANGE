import { Request, Response } from "express";
import conexion from "../conexion/bd";
import crypto from "crypto";


interface VIVInforme {

    informe_id: number;

    empresa_id: number;

    tipo_periodo: string;

    fuente: string;

    fecha_fin_periodo: string | null;
}


interface VIVPartidas {

    INGRESOS?: number;

    DEPRECIACION_AMORTIZACION?: number;

    EBIT?: number;

    GASTO_INTERESES?: number;

    BENEFICIO_ANTES_IMPUESTOS?: number;

    IMPUESTO_BENEFICIOS?: number;

    BENEFICIO_NETO?: number;

    EFECTIVO?: number;

    CUENTAS_COBRAR?: number;

    INVENTARIOS?: number;

    CUENTAS_PAGAR?: number;

    DEUDA_CORTO_PLAZO?: number;

    DEUDA_LARGO_PLAZO?: number;

    FLUJO_CAJA_OPERATIVO?: number;

    CAPEX?: number;

    DIVIDENDOS_PAGADOS?: number;

    ACCIONES_EN_CIRCULACION?: number;

    PATRIMONIO_NETO?: number;

    ACTIVOS_TOTALES?: number;

    PASIVOS_TOTALES?: number;
}


interface VIVKpis {

    EBITDA?: number;

    DEUDA_TOTAL?: number;

    DEUDA_NETA?: number;

    FCF?: number;

    MARGEN_EBIT?: number;

    MARGEN_EBITDA?: number;

    MARGEN_NETO?: number;

    MARGEN_FCF?: number;

    ROA?: number;

    ROE?: number;

    COBERTURA_INTERESES?: number;

    CAPITAL_CIRCULANTE_OPERATIVO?: number;
}


interface VIVSnapshot {

    empresa_id: number;

    informe_id: number;

    tipo_periodo: string;

    fuente_informe: string;

    fecha_fin_periodo: string | null;

    moneda: string | null;

    ingresos: number | null;

    ebit: number | null;

    ebitda: number | null;

    beneficio_neto: number | null;

    efectivo: number | null;

    deuda_corto_plazo: number | null;

    deuda_largo_plazo: number | null;

    deuda_total: number | null;

    deuda_neta: number | null;

    flujo_caja_operativo: number | null;

    capex: number | null;

    fcf: number | null;

    margen_ebit: number | null;

    margen_ebitda: number | null;

    margen_neto: number | null;

    margen_fcf: number | null;

    roa: number | null;

    roe: number | null;

    cobertura_intereses: number | null;

    patrimonio_neto: number | null;

    activos_totales: number | null;

    pasivos_totales: number | null;

    capital_circulante_operativo: number | null;

    nivel_confianza: "ALTA" | "MEDIA";

    hash_inputs: string;

    depreciacion_amortizacion: number | null;

    gasto_intereses: number | null;

    beneficio_antes_impuestos: number | null;

    impuesto_beneficios: number | null;

    cuentas_cobrar: number | null;

    inventarios: number | null;

    cuentas_pagar: number | null;

    dividendos_pagados: number | null;

    acciones_en_circulacion: number | null;
}


// ============================================================================
// 3. UTILIDADES
// ============================================================================

function vivNumero(
    valor: unknown
): number | null {

    const n =
        Number(valor);

    return Number.isFinite(n)
        ? n
        : null;
}


function vivFecha(
    valor: unknown
): string | null {

    if (!valor) {
        return null;
    }

    // MySQL puede devolver DATE como objeto Date de JavaScript
  if (
    valor instanceof Date &&
    Number.isFinite(valor.getTime())
) {
    const year = valor.getFullYear();
    const month = String(valor.getMonth() + 1).padStart(2, "0");
    const day = String(valor.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
}

    // Si ya viene como string YYYY-MM-DD
    const s =
        String(valor)
            .trim();

    const match =
        s.match(
            /^(\d{4}-\d{2}-\d{2})/
        );

    return match
        ? match[1]
        : null;
}


function vivHash(
    snapshotSinHash: Omit<
        VIVSnapshot,
        "hash_inputs"
    >
): string {

    const payload =
        JSON.stringify(
            snapshotSinHash
        );

    return crypto
        .createHash("sha256")
        .update(payload)
        .digest("hex");
}


// ============================================================================
// 4. SELECCIONAR INFORME MAS RECIENTE POR EMPRESA
// ============================================================================
//
// Para crear una version actual de inputs usamos el INFORME_FINANCIERO
// mas reciente que ya tenga partidas y KPI.
//
// Si se quiere valorar un informe concreto, ver endpoint especifico mas abajo.
//
// ============================================================================

async function vivCargarInformesActuales():
Promise<VIVInforme[]> {

    const db =
        conexion as any;

    const [rows]:
        any =
        await db.query(
        `
        SELECT
            x.informe_id,
            x.empresa_id,
            x.tipo_periodo,
            x.fuente,
            x.fecha_fin_periodo

        FROM
        (
            SELECT
                inf.id AS informe_id,
                inf.empresa_id,
                inf.tipo_periodo,
                inf.fuente,
                inf.fecha_fin_periodo,

                ROW_NUMBER() OVER (
                    PARTITION BY inf.empresa_id
                    ORDER BY
                        inf.fecha_fin_periodo DESC,
                        inf.id DESC
                ) AS rn

            FROM informe_financiero inf

            WHERE inf.tipo_periodo = 'ANUAL'

              AND inf.fecha_fin_periodo
                  IS NOT NULL

              AND EXISTS
              (
                  SELECT 1

                  FROM partida_contable_valor pcv

                  WHERE pcv.informe_id =
                        inf.id
              )
        ) x

        WHERE x.rn <= 4

        ORDER BY
            x.empresa_id,
            x.fecha_fin_periodo DESC
        `
    );

    return rows.map(
        (row: any) => ({

            informe_id:
                Number(row.informe_id),

            empresa_id:
                Number(row.empresa_id),

            tipo_periodo:
                String(
                    row.tipo_periodo ||
                    ""
                ),

            fuente:
                String(
                    row.fuente ||
                    ""
                ),

            fecha_fin_periodo:
                vivFecha(
                    row.fecha_fin_periodo
                )
        })
    );
}


// ============================================================================
// 5. CARGAR PARTIDAS DEL INFORME
// ============================================================================

async function vivCargarPartidas(
    informeId: number
): Promise<VIVPartidas> {

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

        WHERE pcv.informe_id = ?
        `,
        [
            informeId
        ]
    );

    const partidas:
        VIVPartidas =
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
            vivNumero(
                row.importe
            );

        if (
            importe === null
        ) {
            continue;
        }

        (partidas as any)[
            concepto
        ] =
            importe;
    }

    return partidas;
}


// ============================================================================
// 6. CARGAR KPI DEL INFORME
// ============================================================================

async function vivCargarKpis(
    informeId: number
): Promise<VIVKpis> {

    const db =
        conexion as any;

    const [rows]:
        any =
        await db.query(
        `
        SELECT

            kpi,

            valor

        FROM kpi_financiero_informe

        WHERE informe_id = ?
        `,
        [
            informeId
        ]
    );

    const kpis:
        VIVKpis =
        {};

    for (
        const row
        of rows
    ) {

        const codigo =
            String(
                row.kpi ||
                ""
            )
            .trim()
            .toUpperCase();

        const valor =
            vivNumero(
                row.valor
            );

        if (
            valor === null
        ) {
            continue;
        }

        (kpis as any)[
            codigo
        ] =
            valor;
    }

    return kpis;
}


// ============================================================================
// 7. MONEDA
// ============================================================================
//
// Si en el futuro INFORME_FINANCIERO tiene moneda, sustituir esta logica.
//
// De momento:
// SEC_EDGAR -> USD
// EDINET    -> JPY
// FINMIND   -> TWD
//
// ============================================================================

function vivMoneda(
    fuente: string
): string | null {

    switch (
        fuente
            .trim()
            .toUpperCase()
    ) {

        case "SEC_EDGAR":
            return "USD";

        case "EDINET":
            return "JPY";

        case "FINMIND":
            return "TWD";

        default:
            return null;
    }
}


// ============================================================================
// 8. NIVEL DE CONFIANZA
// ============================================================================
//
// Primera regla sencilla:
//
// - Si existen INGRESOS + EBIT + BENEFICIO_NETO => ALTA
// - Si falta alguno => MEDIA
//
// En el futuro se puede enriquecer usando nivel_confianza de las partidas.
//
// ============================================================================

function vivNivelConfianza(
    p: VIVPartidas
): "ALTA" | "MEDIA" {

    if (
        p.INGRESOS !== undefined &&
        p.EBIT !== undefined &&
        p.BENEFICIO_NETO !== undefined
    ) {

        return "ALTA";
    }

    return "MEDIA";
}


// ============================================================================
// 9. CREAR SNAPSHOT
// ============================================================================

export async function vivConstruirSnapshot(
    informe: VIVInforme
): Promise<VIVSnapshot> {

    const p =
        await vivCargarPartidas(
            informe.informe_id
        );

    const k =
        await vivCargarKpis(
            informe.informe_id
        );

    const base:
        Omit<
            VIVSnapshot,
            "hash_inputs"
        > =
    {
        empresa_id:
            informe.empresa_id,

        informe_id:
            informe.informe_id,

        tipo_periodo:
            informe.tipo_periodo,

        fuente_informe:
            informe.fuente,

        fecha_fin_periodo:
            informe.fecha_fin_periodo,

        moneda:
            vivMoneda(
                informe.fuente
            ),

                ingresos:
            p.INGRESOS ?? null,

        ebitda:
            k.EBITDA ?? null,

        depreciacion_amortizacion:
            p.DEPRECIACION_AMORTIZACION ?? null,

        ebit:
            p.EBIT ?? null,

        gasto_intereses:
            p.GASTO_INTERESES ?? null,

        beneficio_antes_impuestos:
            p.BENEFICIO_ANTES_IMPUESTOS
            ??
            (
                p.BENEFICIO_NETO !== null &&
                p.BENEFICIO_NETO !== undefined &&
                p.IMPUESTO_BENEFICIOS !== null &&
                p.IMPUESTO_BENEFICIOS !== undefined
                    ? p.BENEFICIO_NETO + p.IMPUESTO_BENEFICIOS
                    : null
            ),

        impuesto_beneficios:
            p.IMPUESTO_BENEFICIOS ?? null,

        beneficio_neto:
            p.BENEFICIO_NETO ?? null,

        efectivo:
            p.EFECTIVO ?? null,

        cuentas_cobrar:
            p.CUENTAS_COBRAR ?? null,

        inventarios:
            p.INVENTARIOS ?? null,

        cuentas_pagar:
            p.CUENTAS_PAGAR ?? null,

        deuda_corto_plazo:
            p.DEUDA_CORTO_PLAZO ?? null,

        deuda_largo_plazo:
            p.DEUDA_LARGO_PLAZO ?? null,

        deuda_total:
            k.DEUDA_TOTAL ?? null,

        deuda_neta:
            k.DEUDA_NETA ?? null,

        patrimonio_neto:
            p.PATRIMONIO_NETO ?? null,

        activos_totales:
            p.ACTIVOS_TOTALES ?? null,

        pasivos_totales:
            p.PASIVOS_TOTALES ?? null,

        capital_circulante_operativo:
            k.CAPITAL_CIRCULANTE_OPERATIVO ?? null,

        flujo_caja_operativo:
            p.FLUJO_CAJA_OPERATIVO ?? null,

        capex:
            p.CAPEX ?? null,

        fcf:
            k.FCF ?? null,

        dividendos_pagados:
            p.DIVIDENDOS_PAGADOS ?? null,

        acciones_en_circulacion:
            p.ACCIONES_EN_CIRCULACION ?? null,

        margen_ebit:
            k.MARGEN_EBIT ?? null,

        margen_ebitda:
            k.MARGEN_EBITDA ?? null,

        margen_neto:
            k.MARGEN_NETO ?? null,

        margen_fcf:
            k.MARGEN_FCF ?? null,

        roa:
            k.ROA ?? null,

        roe:
            k.ROE ?? null,

        cobertura_intereses:
            k.COBERTURA_INTERESES ?? null,

        nivel_confianza:
            vivNivelConfianza(
                p
            )
    };


    return {

        ...base,

        hash_inputs:
            vivHash(
                base
            )
    };
}


// ============================================================================
// 10. GUARDAR VERSION
// ============================================================================

export async function vivGuardarVersion(
    snapshot: VIVSnapshot
): Promise<number> {

    const db = conexion as any;

    const n = (v: number | null | undefined): number => v === null ||v === undefined || !Number.isFinite(v) ? 0 : v;

    const [resultado]:
        any =
        await db.query(
        `
        INSERT INTO valuation_input_version
        (
            empresa_id,
            informe_id,
            tipo_periodo,
            fuente_informe,
            fecha_fin_periodo,
            moneda,

            ingresos,
            ebitda,
            depreciacion_amortizacion,
            ebit,
            gasto_intereses,
            beneficio_antes_impuestos,
            impuesto_beneficios,
            beneficio_neto,

            efectivo,
            cuentas_cobrar,
            inventarios,
            cuentas_pagar,

            deuda_corto_plazo,
            deuda_largo_plazo,
            deuda_total,
            deuda_neta,

            patrimonio_neto,
            activos_totales,
            pasivos_totales,
            capital_circulante_operativo,

            flujo_caja_operativo,
            capex,
            fcf,

            dividendos_pagados,
            acciones_en_circulacion,

            margen_ebit,
            margen_ebitda,
            margen_neto,
            margen_fcf,

            roa,
            roe,
            cobertura_intereses,

            nivel_confianza,
            hash_inputs
        )

        VALUES
        (
            ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
            ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
            ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
            ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
        )

        ON DUPLICATE KEY UPDATE
        ingresos = VALUES(ingresos),
        ebitda = VALUES(ebitda),
        depreciacion_amortizacion = VALUES(depreciacion_amortizacion),
        ebit = VALUES(ebit),
        gasto_intereses = VALUES(gasto_intereses),
        beneficio_antes_impuestos = VALUES(beneficio_antes_impuestos),
        impuesto_beneficios = VALUES(impuesto_beneficios),
        beneficio_neto = VALUES(beneficio_neto),
        efectivo = VALUES(efectivo),
        cuentas_cobrar = VALUES(cuentas_cobrar),
        inventarios = VALUES(inventarios),
        cuentas_pagar = VALUES(cuentas_pagar),
        deuda_corto_plazo = VALUES(deuda_corto_plazo),
        deuda_largo_plazo = VALUES(deuda_largo_plazo),
        deuda_total = VALUES(deuda_total),
        deuda_neta = VALUES(deuda_neta),
        patrimonio_neto = VALUES(patrimonio_neto),
        activos_totales = VALUES(activos_totales),
        pasivos_totales = VALUES(pasivos_totales),
        capital_circulante_operativo = VALUES(capital_circulante_operativo),
        flujo_caja_operativo = VALUES(flujo_caja_operativo),
        capex = VALUES(capex),
        fcf = VALUES(fcf),
        dividendos_pagados = VALUES(dividendos_pagados),
        acciones_en_circulacion = VALUES(acciones_en_circulacion),
        margen_ebit = VALUES(margen_ebit),
        margen_ebitda = VALUES(margen_ebitda),
        margen_neto = VALUES(margen_neto),
        margen_fcf = VALUES(margen_fcf),
        roa = VALUES(roa),
        roe = VALUES(roe),
        cobertura_intereses = VALUES(cobertura_intereses),
        nivel_confianza = VALUES(nivel_confianza),
        hash_inputs = VALUES(hash_inputs)
        `,
        [
            snapshot.empresa_id,
            snapshot.informe_id,
            snapshot.tipo_periodo,
            snapshot.fuente_informe,
            snapshot.fecha_fin_periodo,
            snapshot.moneda,

            n(snapshot.ingresos),
            n(snapshot.ebitda),
            n(snapshot.depreciacion_amortizacion),
            n(snapshot.ebit),
            n(snapshot.gasto_intereses),
            n(snapshot.beneficio_antes_impuestos),
            n(snapshot.impuesto_beneficios),
            n(snapshot.beneficio_neto),

            n(snapshot.efectivo),
            n(snapshot.cuentas_cobrar),
            n(snapshot.inventarios),
            n(snapshot.cuentas_pagar),

            n(snapshot.deuda_corto_plazo),
            n(snapshot.deuda_largo_plazo),
            n(snapshot.deuda_total),
            n(snapshot.deuda_neta),

            n(snapshot.patrimonio_neto),
            n(snapshot.activos_totales),
            n(snapshot.pasivos_totales),
            n(snapshot.capital_circulante_operativo),

            n(snapshot.flujo_caja_operativo),
            n(snapshot.capex),
            n(snapshot.fcf),

            n(snapshot.dividendos_pagados),
            n(snapshot.acciones_en_circulacion),

            n(snapshot.margen_ebit),
            n(snapshot.margen_ebitda),
            n(snapshot.margen_neto),
            n(snapshot.margen_fcf),

            n(snapshot.roa),
            n(snapshot.roe),
            n(snapshot.cobertura_intereses),

            snapshot.nivel_confianza,
            snapshot.hash_inputs
        ]
    );

    return Number(
        resultado?.insertId ||
        0
    );
}


// ============================================================================
// 11. MOTOR PRINCIPAL - CREAR VERSION ACTUAL PARA TODAS LAS EMPRESAS
// ============================================================================

export async function
ejecutarCreacionValuationInputVersion() {

    const inicio =
        Date.now();


    console.log(
        "\n======================================================"
    );

    console.log(
        " VALUATION_INPUT_VERSION - CREACION UNIVERSAL"
    );

    console.log(
        "======================================================"
    );


    const informes =
        await vivCargarInformesActuales();


    console.log(
        `[VIV] Informes actuales detectados: ` +
        `${informes.length}`
    );


    let procesados =
        0;

    let creados =
        0;

    let duplicados =
        0;

    let errores =
        0;


    const porFuente:
        Record<
            string,
            number
        > =
        {};


    for (
        const informe
        of informes
    ) {

        try {

            const snapshot =
                await vivConstruirSnapshot(
                    informe
                );


            const insertId =
                await vivGuardarVersion(
                    snapshot
                );


            if (
                insertId > 0
            ) {

                creados++;

            } else {

                duplicados++;
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

                    `[VIV] Procesados ` +
                    `${procesados}/` +
                    `${informes.length}` +

                    ` | creados: ` +
                    `${creados}` +

                    ` | duplicados: ` +
                    `${duplicados}` +

                    ` | errores: ` +
                    `${errores}`
                );
            }


        } catch (error) {

            errores++;


            console.error(
                `[VIV] Error informe ` +
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
        "\n[VIV] RESUMEN FINAL"
    );


    console.log(
        `- Informes seleccionados: ` +
        `${informes.length}`
    );


    console.log(
        `- Procesados: ` +
        `${procesados}`
    );


    console.log(
        `- Versiones creadas: ` +
        `${creados}`
    );


    console.log(
        `- Duplicadas/ya existentes: ` +
        `${duplicados}`
    );


    console.log(
        `- Errores: ` +
        `${errores}`
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

        creados,

        duplicados,

        errores,

        porFuente,

        duracionMs
    };
}


// ============================================================================
// 12. ENDPOINT EXPRESS - TODAS LAS EMPRESAS
// ============================================================================
//
// POST:
//
// /api/valuation-input-version/actualizar
//
// ============================================================================

export async function
actualizarValuationInputVersion(
    _req: Request,
    res: Response
): Promise<void> {

    try {

        const resultado =
            await ejecutarCreacionValuationInputVersion();


        res.status(
            200
        ).json({

            ok:
                true,

            mensaje:
                "VALUATION_INPUT_VERSION generada correctamente.",

            resumen:
                resultado
        });


    } catch (error) {

        console.error(
            "[VIV] ERROR CRITICO:",
            error
        );


        res.status(
            500
        ).json({

            ok:
                false,

            mensaje:
                "No se pudo generar VALUATION_INPUT_VERSION.",

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
// 13. ENDPOINT EXPRESS - UNA EMPRESA / UN INFORME
// ============================================================================
//
// POST:
//
// /api/valuation-input-version/informe/:informeId
//
// ============================================================================

export async function
crearValuationInputVersionPorInforme(
    req: Request,
    res: Response
): Promise<void> {

    try {

        const informeId =
            Number(
                req.params.informeId
            );


        if (
            !Number.isFinite(
                informeId
            ) ||
            informeId <= 0
        ) {

            res.status(
                400
            ).json({

                ok:
                    false,

                mensaje:
                    "informeId invalido."
            });

            return;
        }


        const db =
            conexion as any;


        const [rows]:
            any =
            await db.query(
            `
            SELECT

                id AS informe_id,

                empresa_id,

                tipo_periodo,

                fuente,

                fecha_fin_periodo

            FROM informe_financiero

            WHERE id = ?

            LIMIT 1
            `,
            [
                informeId
            ]
        );


        if (
            rows.length === 0
        ) {

            res.status(
                404
            ).json({

                ok:
                    false,

                mensaje:
                    "Informe no encontrado."
            });

            return;
        }


        const row =
            rows[0];


        const informe:
            VIVInforme =
        {

            informe_id:
                Number(
                    row.informe_id
                ),

            empresa_id:
                Number(
                    row.empresa_id
                ),

            tipo_periodo:
                String(
                    row.tipo_periodo ||
                    ""
                ),

            fuente:
                String(
                    row.fuente ||
                    ""
                ),

            fecha_fin_periodo:
                vivFecha(
                    row.fecha_fin_periodo
                )
        };


        const snapshot =
            await vivConstruirSnapshot(
                informe
            );


        const insertId =
            await vivGuardarVersion(
                snapshot
            );


        res.status(
            200
        ).json({

            ok:
                true,

            mensaje:
                insertId > 0
                    ?
                    "Version creada."
                    :
                    "Version identica ya existente.",

            valuation_input_version_id:
                insertId || null,

            hash_inputs:
                snapshot.hash_inputs
        });


    } catch (error) {

        console.error(
            "[VIV] ERROR POR INFORME:",
            error
        );


        res.status(
            500
        ).json({

            ok:
                false,

            mensaje:
                "No se pudo crear la version de inputs.",

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
// 14. EJECUCION DIRECTA
// ============================================================================
//
// Para ejecutar:
//
// npx ts-node insercionValuationInputVersion.ts
//
// ============================================================================

ejecutarCreacionValuationInputVersion()

    .then(
        resultado => {

            console.log(
                "\n=== VALUATION_INPUT_VERSION FINALIZADA ==="
            );


            console.log(
                resultado
            );
        }
    )

    .catch(
        error => {

            console.error(
                "\n=== ERROR CRITICO VALUATION_INPUT_VERSION ===",
                error
            );


            process.exitCode =
                1;
        }
    );
