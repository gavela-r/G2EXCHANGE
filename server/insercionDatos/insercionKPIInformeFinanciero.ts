import { seleccionarObservaciones, perimetroDeEtiqueta } from "../src/pcv/seleccionObservaciones";

// Perímetro de beneficio y patrimonio de cada conjunto de partidas cargado (ver kpiCalcularInforme: ROE).
const PERIMETROS = new WeakMap<object, { beneficio: string | null; patrimonio: string | null }>();
export function kpiRegistrarPerimetros(valores: object, perimetros: { beneficio: string | null; patrimonio: string | null }) { PERIMETROS.set(valores, perimetros); }
import { normalizarPartidas } from "../src/valoracion/datos";
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

    if(valor===null || valor===undefined || valor==="")return null;
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
    return (await kpiCargarPartidasConDiagnostico(informeId)).valores;
}

// Igual que kpiCargarPartidas, devolviendo también los conceptos resueltos y sin resolver por SELECCION_OBSERVACIONES_V2.
export async function kpiCargarPartidasConDiagnostico(
    informeId: number
): Promise<{ valores: KpiPartidas; sinResolver: { concepto: string; motivo: string }[]; resueltas: { concepto: string; criterio: string }[] }> {

    const db =
        conexion as any;

    const [rows]:
        any =
        await db.query(
        `
        SELECT

            pcv.id, tc.concepto_estandar, pcv.concepto, tc.signo_esperado, tc.alias_sec, tc.alias_edinet, tc.alias_finmind,

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

    const [meta]: any = await db.query("SELECT fuente FROM informe_financiero WHERE id=?",[informeId]);
    // SELECCION_OBSERVACIONES_V2: con varias filas para un concepto, la observación la decide la evidencia primaria o
    // la etiqueta del estado principal; un concepto sin resolver se excluye (sólo bloquea los KPI que lo usan).
    const [prov]: any = await db.query(
        "SELECT concept_code, JSON_EXTRACT(evidence_json,'$.evidence.record_id') rid, JSON_EXTRACT(evidence_json,'$.evidence.record_ids') rids FROM pcv_verification_evidence WHERE informe_id=? AND outcome IN ('INSERTED','NULL_FILLED','VERIFIED_EXISTING')",
        [informeId]
    );
    const certificadas = new Map<string, Set<number>>();
    for (const p of prov) {
        const s = certificadas.get(p.concept_code) ?? certificadas.set(p.concept_code, new Set()).get(p.concept_code)!;
        const lista = [p.rid, ...(Array.isArray(p.rids) ? p.rids : typeof p.rids === "string" ? JSON.parse(p.rids) : [])];
        for (const id of lista) if (Number.isInteger(Number(id)) && id !== null) s.add(Number(id));
    }
    const { valores, seleccion } = kpiValoresDeFilas(rows, meta[0]?.fuente ?? "", certificadas);
    return { valores, sinResolver: seleccion.sinResolver, resueltas: seleccion.resueltas };
}

// Única ruta de filas PCV → valores KPI (recálculo, recuperadores): SELECCION_OBSERVACIONES, normalización y registro
// del perímetro de beneficio y patrimonio que exige el ROE.
export function kpiValoresDeFilas(filas: any[], fuente: string, certificadas: Map<string, Set<number>> = new Map()) {
    const seleccion = seleccionarObservaciones<any>(filas, certificadas);
    const valores = normalizarPartidas(seleccion.filas, fuente).valores;
    const per = (c: string) => { const p = new Set(seleccion.filas.filter((f: any) => f.concepto_estandar === c && f.importe !== null).map((f: any) => perimetroDeEtiqueta(c, f.concepto))); return p.size === 1 ? [...p][0] : null; };
    PERIMETROS.set(valores, { beneficio: per("BENEFICIO_NETO"), patrimonio: per("PATRIMONIO_NETO") });
    return { valores, seleccion };
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

// Requisito de deuda (BOTH_VERIFIED_DEBT_COMPONENTS_REQUIRED_V2): un KPI de deuda exige los dos componentes. Es una
// condición de elegibilidad, no un cambio de fórmula; vive aquí para que TODOS los escritores la apliquen.
export const KPI_DEUDA = new Set(["DEUDA_TOTAL", "DEUDA_NETA", "DEUDA_SOBRE_PATRIMONIO", "DEUDA_SOBRE_ACTIVOS"]);
export const kpiDeudaCompleta = (v: KpiPartidas) => Number.isFinite(v.DEUDA_CORTO_PLAZO) && Number.isFinite(v.DEUDA_LARGO_PLAZO);
export function kpiCalcularInforme(informeId: number, p: KpiPartidas): KpiCalculado[] {
    return kpiCalcularInformeSinRequisitos(informeId, p).filter(k => !KPI_DEUDA.has(k.kpi) || kpiDeudaCompleta(p));
}
(kpiCalcularInforme as any).pcvPrerequisitesV2 = true;
(kpiCalcularInforme as any).originalFormula = (id: number, p: KpiPartidas) => kpiCalcularInformeSinRequisitos(id, p);

// Fórmulas sin el requisito de deuda (sólo para clasificar la causa de una exclusión).
export function kpiCalcularInformeSinRequisitos(
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


    // ROE exige beneficio y patrimonio del MISMO perímetro (dominante/dominante o total/total); si consta que difieren,
    // no se calcula (PERIMETRO_INCOMPATIBLE). Margen neto usa BENEFICIO_NETO tal como lo define la taxonomía del país.
    const perimetros = PERIMETROS.get(p);
    // ROE sólo con beneficio y patrimonio de perímetro CONOCIDO e igual (dominante/dominante o total/total).
    if (!perimetros?.beneficio || !perimetros?.patrimonio || perimetros.beneficio !== perimetros.patrimonio) return resultado.filter(k => k.kpi !== "ROE");
    return resultado;
}


// ============================================================================
// 7. GUARDAR KPI
// ============================================================================

// Compatibilidad: no escribe los valores recibidos; vuelve a sincronizar cada informe con el escritor único
// (kpiSincronizarInforme) para que nunca se persista un KPI calculado con reglas antiguas.
export async function kpiGuardar(kpis: KpiCalculado[]): Promise<number> {
    let n = 0;
    for (const id of new Set(kpis.map(k => k.informeId))) { const r = await kpiSincronizarInforme(conexion as any, id, true); n += r.escribir.length + r.eliminados.length; }
    return n;
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

            // Escritura única (kpiSincronizarInforme): reglas vigentes; retira con causa lo que ya no es calculable.
            const sync = await kpiSincronizarInforme(conexion as any, informe.informe_id, true);
            if (sync.iguales + sync.escribir.length === 0) {
                sinKpi++;
            } else {
                kpisCalculados += sync.iguales + sync.escribir.length;
                operacionesBD += sync.escribir.length + sync.eliminados.length;
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

if (require.main === module) {

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
}



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


// ============================================================================
// SINCRONIZACIÓN ÚNICA DE KPI PERSISTIDOS
// ============================================================================
// Única escritura de kpi_financiero_informe: PCV del informe → SELECCION_OBSERVACIONES (con evidencia primaria) →
// normalización → perímetro → fórmulas con requisitos vigentes. Escribe sólo cambios reales (DECIMAL(30,10): media
// unidad de la décima cifra decimal), retira con causa los KPI que ya no son calculables y nunca guarda un valor que
// la columna redondearía a cero. Idempotente: una segunda ejecución no cambia nada.
export interface SincronizacionKpi {
    informeId: number; antes: { kpi: string; valor: string | null; unidad: string | null; nivel_confianza: string | null }[];
    escribir: KpiCalculado[]; vigentes: KpiCalculado[]; nuevos: number; cambiados: number; iguales: number;
    eliminados: { kpi: string; motivo: string }[]; pendientes: { kpi: string; motivo: string }[];
    sinResolver: number; error: string | null;
}
const kpiIgual = (a: number, b: number) => Math.abs(a - b) <= 5e-11 + Math.abs(b) * 1e-14;
const KPI_ENTRADAS: Record<string, string[]> = {
    MARGEN_BRUTO: ["BENEFICIO_BRUTO", "INGRESOS"], MARGEN_EBIT: ["EBIT", "INGRESOS"], MARGEN_NETO: ["BENEFICIO_NETO", "INGRESOS"],
    ROA: ["BENEFICIO_NETO", "ACTIVOS_TOTALES"], ROE: ["BENEFICIO_NETO", "PATRIMONIO_NETO"], EBITDA: ["EBIT", "DEPRECIACION_AMORTIZACION"],
    MARGEN_EBITDA: ["EBIT", "DEPRECIACION_AMORTIZACION", "INGRESOS"], COBERTURA_INTERESES: ["EBIT", "GASTO_INTERESES"],
    FCF: ["FLUJO_CAJA_OPERATIVO", "CAPEX"], MARGEN_FCF: ["FLUJO_CAJA_OPERATIVO", "CAPEX", "INGRESOS"],
    CAPITAL_CIRCULANTE_OPERATIVO: ["INVENTARIOS", "CUENTAS_COBRAR", "CUENTAS_PAGAR"],
    CAPITAL_CIRCULANTE_OPERATIVO_SOBRE_INGRESOS: ["INVENTARIOS", "CUENTAS_COBRAR", "CUENTAS_PAGAR", "INGRESOS"],
    PASIVO_SOBRE_ACTIVOS: ["PASIVOS_TOTALES", "ACTIVOS_TOTALES"]
};
export async function kpiSincronizarInforme(db: { query: (sql: string, params?: unknown[]) => Promise<any> }, informeId: number, aplicar: boolean): Promise<SincronizacionKpi> {
    const [antes]: any = await db.query("SELECT kpi,valor,unidad,nivel_confianza FROM kpi_financiero_informe WHERE informe_id=? ORDER BY kpi" + (aplicar ? " FOR UPDATE" : ""), [informeId]);
    const r: SincronizacionKpi = { informeId, antes, escribir: [], vigentes: [], nuevos: 0, cambiados: 0, iguales: 0, eliminados: [], pendientes: [], sinResolver: 0, error: null };
    const [rows]: any = await db.query("SELECT pcv.id,tc.concepto_estandar,pcv.concepto,tc.signo_esperado,tc.alias_sec,tc.alias_edinet,tc.alias_finmind,pcv.importe FROM partida_contable_valor pcv JOIN taxonomia_concepto tc ON tc.id=pcv.concepto_estandar_id WHERE pcv.informe_id=?", [informeId]);
    const [meta]: any = await db.query("SELECT fuente FROM informe_financiero WHERE id=?", [informeId]);
    const [prov]: any = await db.query("SELECT concept_code, JSON_EXTRACT(evidence_json,'$.evidence.record_id') rid, JSON_EXTRACT(evidence_json,'$.evidence.record_ids') rids FROM pcv_verification_evidence WHERE informe_id=? AND outcome IN ('INSERTED','NULL_FILLED','VERIFIED_EXISTING')", [informeId]);
    const certificadas = new Map<string, Set<number>>();
    for (const x of prov) {
        const set = certificadas.get(x.concept_code) ?? certificadas.set(x.concept_code, new Set()).get(x.concept_code)!;
        for (const id of [x.rid, ...(Array.isArray(x.rids) ? x.rids : typeof x.rids === "string" ? JSON.parse(x.rids) : [])]) if (id !== null && Number.isInteger(Number(id))) set.add(Number(id));
    }
    // Conflicto con la evidencia primaria sin resolver (CONFLICT_PRESERVED sin CONFLICT_RESOLVED de una regla versionada,
    // mismo criterio que cobertura_mysql.cjs y el adaptador): sin filas certificadas el concepto no alimenta ningún KPI;
    // con filas certificadas sólo se usan éstas. Nunca se calcula con un original que la fuente primaria contradice.
    const [preservados]: any = await db.query("SELECT concept_code, evidence_hash FROM pcv_verification_evidence WHERE informe_id=? AND outcome='CONFLICT_PRESERVED'", [informeId]);
    const [resueltos]: any = await db.query("SELECT JSON_UNQUOTE(JSON_EXTRACT(evidence_json,'$.resolves')) resuelve FROM pcv_verification_evidence WHERE informe_id=? AND outcome='CONFLICT_RESOLVED' AND JSON_UNQUOTE(JSON_EXTRACT(evidence_json,'$.correction.rule')) IN ('JP_EFECTIVO_EQUIVALENTES_V1','US_PERIODO_V1','JP_RESUMEN_MISMO_DOC_V1','JP_SIGNO_CANONICO_V1')", [informeId]);
    const hashesResueltos = new Set<string>(resueltos.map((x: any) => String(x.resuelve)));
    const enConflicto = new Set<string>(preservados.filter((x: any) => !hashesResueltos.has(String(x.evidence_hash))).map((x: any) => String(x.concept_code)));
    const filasUsables = rows.filter((f: any) => !enConflicto.has(f.concepto_estandar) || certificadas.get(f.concepto_estandar)?.has(Number(f.id)));
    const excluidosPorConflicto = [...enConflicto].filter(c => !filasUsables.some((f: any) => f.concepto_estandar === c));
    let valores: KpiPartidas | null = null, sinResolver: string[] = [];
    try { const v = kpiValoresDeFilas(filasUsables, meta[0]?.fuente ?? "", certificadas); valores = v.valores; sinResolver = v.seleccion.sinResolver.map(x => x.concepto); }
    catch (e: any) { r.error = String(e?.message ?? e).slice(0, 200); }
    r.sinResolver = sinResolver.length;
    // BOTH_VERIFIED_DEBT_COMPONENTS_REQUIRED_V2: los KPI de deuda exigen los DOS componentes con evidencia primaria
    // (record_id certificado de una fila usable no nula), no sólo presentes.
    const componenteVerificado = (c: string) => filasUsables.some((f: any) => f.concepto_estandar === c && f.importe !== null && certificadas.get(c)?.has(Number(f.id)));
    const deudaVerificada = componenteVerificado("DEUDA_CORTO_PLAZO") && componenteVerificado("DEUDA_LARGO_PLAZO");
    const calculados = valores ? kpiCalcularInforme(informeId, valores).filter(k => k.valor !== null && Number.isFinite(Number(k.valor)) && (!KPI_DEUDA.has(k.kpi) || deudaVerificada)) : [];
    const sinRequisitos = new Set(valores ? kpiCalcularInformeSinRequisitos(informeId, valores).filter(k => k.valor !== null).map(k => k.kpi) : []);
    const previo = new Map<string, any>(antes.map((k: any) => [k.kpi, k])), validos = new Set<string>();
    for (const k of calculados) {
        if (k.valor !== 0 && Math.abs(k.valor as number) < 5e-11) { r.pendientes.push({ kpi: k.kpi, motivo: "PRECISION_DECIMAL_30_10" }); continue; }
        validos.add(k.kpi); r.vigentes.push(k); const p = previo.get(k.kpi);
        if (!p || p.valor === null) { r.nuevos++; r.escribir.push(k); }
        else if (!kpiIgual(Number(p.valor), Number(k.valor)) || p.unidad !== k.unidad || String(p.nivel_confianza ?? "").toLowerCase() !== String(k.nivelConfianza ?? "").toLowerCase()) { r.cambiados++; r.escribir.push(k); }
        else r.iguales++;
    }
    for (const k of antes) {
        if (validos.has(k.kpi)) continue;
        if (r.pendientes.some(x => x.kpi === k.kpi)) { r.eliminados.push({ kpi: k.kpi, motivo: "PRECISION_DECIMAL_30_10" }); continue; }
        const entradas = KPI_ENTRADAS[k.kpi] ?? [];
        const motivo = r.error ? "NORMALIZACION_RECHAZADA"
            : KPI_DEUDA.has(k.kpi) && (sinRequisitos.has(k.kpi) || !deudaVerificada) ? "PRERREQUISITO_DEUDA_V2"
            : k.kpi === "ROE" && valores?.BENEFICIO_NETO !== undefined && valores?.PATRIMONIO_NETO !== undefined ? "PERIMETRO_DESCONOCIDO_O_INCOMPATIBLE"
            : entradas.some(c => excluidosPorConflicto.includes(c)) || (KPI_DEUDA.has(k.kpi) && excluidosPorConflicto.some(c => c.startsWith("DEUDA_"))) ? "ENTRADA_EN_CONFLICTO:" + excluidosPorConflicto.join(",")
            : entradas.some(c => sinResolver.includes(c)) || (KPI_DEUDA.has(k.kpi) && sinResolver.some(c => c.startsWith("DEUDA_"))) ? "ENTRADA_SIN_RESOLVER:" + sinResolver.join(",")
            : "ENTRADA_AUSENTE_O_NULA";
        r.eliminados.push({ kpi: k.kpi, motivo });
    }
    if (aplicar) {
        if (r.eliminados.length) await db.query("DELETE FROM kpi_financiero_informe WHERE informe_id=? AND kpi IN (?)", [informeId, r.eliminados.map(x => x.kpi)]);
        if (r.escribir.length) await db.query("INSERT INTO kpi_financiero_informe(informe_id,kpi,valor,unidad,nivel_confianza,fecha_calculo) VALUES ? ON DUPLICATE KEY UPDATE valor=VALUES(valor),unidad=VALUES(unidad),nivel_confianza=VALUES(nivel_confianza),fecha_calculo=CURRENT_TIMESTAMP", [r.escribir.map(k => [k.informeId, k.kpi, k.valor, k.unidad, k.nivelConfianza, new Date()])]);
    }
    return r;
}
