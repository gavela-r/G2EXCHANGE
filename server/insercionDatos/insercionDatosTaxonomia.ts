import { Request, Response } from "express";
import conexion from "../conexion/bd";

// ============================================================================
// 1. TIPOS
// ============================================================================

interface TaxonomiaConceptoDef {
    concepto_estandar: string;
    categoria: "CUENTA_RESULTADOS" | "BALANCE" | "FLUJO_CAJA" | "RATIO" | "OTRO";
    alias_sec?: string | null;
    alias_edinet?: string | null;
    alias_finmind?: string | null;
    descripcion: string;
    unidad_tipo: "MONEDA" | "PORCENTAJE" | "VECES" | "NUMERO" | "ACCIONES";
    signo_esperado: "POSITIVO" | "NEGATIVO" | "VARIABLE";
    activo: boolean;
}

// ============================================================================
// 2. TAXONOMIA MAESTRA INICIAL
//
// Esta lista contiene los conceptos que ya estamos usando en:
// PARTIDA_CONTABLE_VALOR
// KPI_FINANCIERO_INFORME
// RATING_SINTETICO
// VALUATION
//
// alias_sec      -> tag us-gaap habitual en SEC (EE. UU.)
// alias_edinet   -> elemento XBRL de EDINET, sin prefijo jppfs_cor (Japon, JP GAAP).
//                   Bajo IFRS el elemento puede ser otro (jpigp_cor:...).
// alias_finmind  -> valor del campo "type" en FinMind (Taiwan). Buscarlo dentro del
//                   dataset que corresponde a la categoria (resultados, balance o
//                   flujo de caja): el mismo nombre puede existir en varios datasets.
//                   Si hay varios tipos separados por coma, se suman.
//
// Valores especiales (no son nombres reales de ninguna API):
//   CALCULADO      -> concepto derivado (RATIO): se calcula, ninguna fuente lo devuelve.
//   NO_DISPONIBLE  -> la fuente no ofrece un dato equivalente.
// La ingesta debe ignorar estos dos valores al buscar por alias.
//
// Alias de EDINET marcados con "sin verificar": son nombres estandar de la
// taxonomia japonesa (JP GAAP) pendientes de contrastar con datos reales.
// ============================================================================

const TAXONOMIA_CONCEPTOS: TaxonomiaConceptoDef[] = [
    // ========================================================================
    // CUENTA DE RESULTADOS
    // ========================================================================

    {
        concepto_estandar: "INGRESOS",
        categoria: "CUENTA_RESULTADOS",
        alias_sec: "Revenues",
        alias_edinet: "NetSales",
        alias_finmind: "Revenue",
        descripcion: "Ingresos o ventas netas del periodo.",
        unidad_tipo: "MONEDA",
        signo_esperado: "POSITIVO",
        activo: true
    },
    {
        concepto_estandar: "BENEFICIO_BRUTO",
        categoria: "CUENTA_RESULTADOS",
        alias_sec: "GrossProfit",
        alias_edinet: "GrossProfit",
        alias_finmind: "GrossProfit",
        descripcion: "Beneficio bruto antes de gastos operativos.",
        unidad_tipo: "MONEDA",
        signo_esperado: "VARIABLE",
        activo: true
    },
    {
        concepto_estandar: "EBIT",
        categoria: "CUENTA_RESULTADOS",
        alias_sec: "OperatingIncomeLoss",
        alias_edinet: "OperatingIncome",
        alias_finmind: "OperatingIncome",
        descripcion: "Resultado operativo antes de intereses e impuestos.",
        unidad_tipo: "MONEDA",
        signo_esperado: "VARIABLE",
        activo: true
    },
    {
        concepto_estandar: "BENEFICIO_NETO",
        categoria: "CUENTA_RESULTADOS",
        alias_sec: "NetIncomeLoss",
        alias_edinet: "ProfitLossAttributableToOwnersOfParent",
        alias_finmind: "IncomeAfterTaxes",
        descripcion: "Resultado neto atribuible del periodo.",
        unidad_tipo: "MONEDA",
        signo_esperado: "VARIABLE",
        activo: true
    },
    {
        concepto_estandar: "GASTO_INTERESES",
        categoria: "CUENTA_RESULTADOS",
        alias_sec: "InterestExpense",
        alias_edinet: "InterestExpensesNOE", // sin verificar
        alias_finmind: "InterestExpense", // OJO: esta en el dataset TaiwanStockCashFlowsStatement
        descripcion: "Gasto financiero por intereses del periodo.",
        unidad_tipo: "MONEDA",
        signo_esperado: "VARIABLE",
        activo: true
    },
    {
        concepto_estandar: "BENEFICIO_ANTES_IMPUESTOS",
        categoria: "CUENTA_RESULTADOS",
        alias_sec: "IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest",
        alias_edinet: "IncomeBeforeIncomeTaxes", // sin verificar
        alias_finmind: "PreTaxIncome",
        descripcion: "Resultados antes de impuestos del periodo.",
        unidad_tipo: "MONEDA",
        signo_esperado: "VARIABLE",
        activo: true
    },
    {
        concepto_estandar: "IMPUESTO_BENEFICIOS",
        categoria: "CUENTA_RESULTADOS",
        alias_sec: "IncomeTaxExpenseBenefit",
        alias_edinet: "IncomeTaxes", // sin verificar
        alias_finmind: "TAX",
        descripcion: "Gasto o ingreso por impuesto sobre beneficios.",
        unidad_tipo: "MONEDA",
        signo_esperado: "VARIABLE",
        activo: true
    },
    {
        // OJO: el "EPS" de FinMind es el beneficio por accion BASICO, no el diluido.
        concepto_estandar: "EPS_DILUIDO",
        categoria: "CUENTA_RESULTADOS",
        alias_sec: "EarningsPerShareDiluted",
        alias_edinet: "DilutedEarningsPerShare", // sin verificar
        alias_finmind: "EPS",
        descripcion: "Beneficio por accion diluido.",
        unidad_tipo: "NUMERO",
        signo_esperado: "VARIABLE",
        activo: true
    },

    // ========================================================================
    // BALANCE
    // ========================================================================

    {
        concepto_estandar: "EFECTIVO",
        categoria: "BALANCE",
        alias_sec: "CashAndCashEquivalentsAtCarryingValue",
        alias_edinet: "CashAndDeposits",
        alias_finmind: "CashAndCashEquivalents",
        descripcion: "Caja, efectivo y equivalentes de efectivo.",
        unidad_tipo: "MONEDA",
        signo_esperado: "POSITIVO",
        activo: true
    },
    {
        concepto_estandar: "ACTIVOS_TOTALES",
        categoria: "BALANCE",
        alias_sec: "Assets",
        alias_edinet: "Assets",
        alias_finmind: "TotalAssets",
        descripcion: "Total de activos de la empresa.",
        unidad_tipo: "MONEDA",
        signo_esperado: "POSITIVO",
        activo: true
    },
    {
        concepto_estandar: "PASIVOS_TOTALES",
        categoria: "BALANCE",
        alias_sec: "Liabilities",
        alias_edinet: "Liabilities", // sin verificar
        alias_finmind: "Liabilities",
        descripcion: "Total de pasivos de la empresa.",
        unidad_tipo: "MONEDA",
        signo_esperado: "POSITIVO",
        activo: true
    },
    {
        concepto_estandar: "PATRIMONIO_NETO",
        categoria: "BALANCE",
        alias_sec: "StockholdersEquity",
        alias_edinet: "NetAssets", // sin verificar
        alias_finmind: "Equity",
        descripcion: "Patrimonio neto o equity atribuible.",
        unidad_tipo: "MONEDA",
        signo_esperado: "VARIABLE",
        activo: true
    },
    {
        concepto_estandar: "ACCIONES_EN_CIRCULACION",
        categoria: "BALANCE",
        alias_sec: "CommonStockSharesOutstanding",
        alias_edinet: "NumberOfIssuedSharesAsOfFiscalYearEndIssuedSharesTotalNumberOfSharesEtc", // sin verificar
        alias_finmind: "NO_DISPONIBLE",
        descripcion: "Numero de acciones en circulacion al cierre del periodo.",
        unidad_tipo: "ACCIONES",
        signo_esperado: "POSITIVO",
        activo: true
    },
    {
        concepto_estandar: "DEUDA_CORTO_PLAZO",
        categoria: "BALANCE",
        alias_sec: "DebtCurrent",
        alias_edinet: "ShortTermLoansPayable", // sin verificar
        alias_finmind: "ShorttermBorrowings",
        descripcion: "Deuda financiera corriente o con vencimiento a corto plazo.",
        unidad_tipo: "MONEDA",
        signo_esperado: "POSITIVO",
        activo: true
    },
    {
        concepto_estandar: "DEUDA_LARGO_PLAZO",
        categoria: "BALANCE",
        alias_sec: "LongTermDebtNoncurrent",
        alias_edinet: "LongTermLoansPayable,BondsPayable", // sin verificar
        alias_finmind: "LongtermBorrowings,BondsPayable", // dos tipos: hay que sumarlos
        descripcion: "Deuda financiera no corriente o a largo plazo.",
        unidad_tipo: "MONEDA",
        signo_esperado: "POSITIVO",
        activo: true
    },
    {
        concepto_estandar: "INVENTARIOS",
        categoria: "BALANCE",
        alias_sec: "InventoryNet",
        alias_edinet: "Inventories", // sin verificar
        alias_finmind: "Inventories",
        descripcion: "Inventarios o existencias.",
        unidad_tipo: "MONEDA",
        signo_esperado: "POSITIVO",
        activo: true
    },
    {
        concepto_estandar: "CUENTAS_COBRAR",
        categoria: "BALANCE",
        alias_sec: "AccountsReceivableNetCurrent",
        alias_edinet: "NotesAndAccountsReceivableTrade", // sin verificar
        alias_finmind: "AccountsReceivableNet",
        descripcion: "Cuentas comerciales y otras cuentas por cobrar.",
        unidad_tipo: "MONEDA",
        signo_esperado: "POSITIVO",
        activo: true
    },
    {
        concepto_estandar: "CUENTAS_PAGAR",
        categoria: "BALANCE",
        alias_sec: "AccountsPayableCurrent",
        alias_edinet: "NotesAndAccountsPayableTrade", // sin verificar
        alias_finmind: "AccountsPayable",
        descripcion: "Cuentas comerciales y otras cuentas por pagar.",
        unidad_tipo: "MONEDA",
        signo_esperado: "POSITIVO",
        activo: true
    },

    // ========================================================================
    // FLUJO DE CAJA
    // ========================================================================

    {
        concepto_estandar: "FLUJO_CAJA_OPERATIVO",
        categoria: "FLUJO_CAJA",
        alias_sec: "NetCashProvidedByUsedInOperatingActivities",
        alias_edinet: "NetCashProvidedByUsedInOperatingActivities",
        alias_finmind: "CashFlowsFromOperatingActivities",
        descripcion: "Flujo de caja generado por las actividades operativas.",
        unidad_tipo: "MONEDA",
        signo_esperado: "VARIABLE",
        activo: true
    },
    {
        concepto_estandar: "CAPEX",
        categoria: "FLUJO_CAJA",
        alias_sec: "PaymentsToAcquirePropertyPlantAndEquipment",
        alias_edinet: "PurchaseOfPropertyPlantAndEquipmentInvCF", // sin verificar
        alias_finmind: "PropertyAndPlantAndEquipment",
        descripcion: "Inversion en propiedad, planta y equipo.",
        unidad_tipo: "MONEDA",
        signo_esperado: "VARIABLE",
        activo: true
    },
    {
        concepto_estandar: "DIVIDENDOS_PAGADOS",
        categoria: "FLUJO_CAJA",
        alias_sec: "PaymentsOfDividends",
        alias_edinet: "CashDividendsPaidFinCF",
        alias_finmind: "NO_DISPONIBLE",
        descripcion: "Dividendos pagados durante el periodo.",
        unidad_tipo: "MONEDA",
        signo_esperado: "VARIABLE",
        activo: true
    },
    {
        concepto_estandar: "DEPRECIACION_AMORTIZACION",
        categoria: "FLUJO_CAJA",
        alias_sec: "DepreciationDepletionAndAmortization",
        alias_edinet: "DepreciationAndAmortizationOpeCF", // sin verificar
        alias_finmind: "Depreciation,AmortizationExpense", // dos tipos: hay que sumarlos
        descripcion: "Depreciacion y amortizacion del periodo.",
        unidad_tipo: "MONEDA",
        signo_esperado: "POSITIVO",
        activo: true
    },

    // ========================================================================
    // CONCEPTOS DERIVADOS / KPI (sin alias: se calculan)
    // ========================================================================

    {
        concepto_estandar: "EBITDA",
        categoria: "RATIO",
        alias_sec: "CALCULADO",
        alias_edinet: "CALCULADO",
        alias_finmind: "CALCULADO",
        descripcion: "EBIT mas depreciacion y amortizacion.",
        unidad_tipo: "MONEDA",
        signo_esperado: "VARIABLE",
        activo: true
    },
    {
        concepto_estandar: "DEUDA_TOTAL",
        categoria: "RATIO",
        alias_sec: "CALCULADO",
        alias_edinet: "CALCULADO",
        alias_finmind: "CALCULADO",
        descripcion: "Deuda financiera total: corto plazo mas largo plazo.",
        unidad_tipo: "MONEDA",
        signo_esperado: "POSITIVO",
        activo: true
    },
    {
        concepto_estandar: "DEUDA_NETA",
        categoria: "RATIO",
        alias_sec: "CALCULADO",
        alias_edinet: "CALCULADO",
        alias_finmind: "CALCULADO",
        descripcion: "Deuda total menos efectivo y equivalentes.",
        unidad_tipo: "MONEDA",
        signo_esperado: "VARIABLE",
        activo: true
    },
    {
        concepto_estandar: "FCF",
        categoria: "RATIO",
        alias_sec: "CALCULADO",
        alias_edinet: "CALCULADO",
        alias_finmind: "CALCULADO",
        descripcion: "Free Cash Flow: flujo de caja operativo menos CAPEX.",
        unidad_tipo: "MONEDA",
        signo_esperado: "VARIABLE",
        activo: true
    },
    {
        concepto_estandar: "MARGEN_BRUTO",
        categoria: "RATIO",
        alias_sec: "CALCULADO",
        alias_edinet: "CALCULADO",
        alias_finmind: "CALCULADO",
        descripcion: "Beneficio bruto dividido entre ingresos.",
        unidad_tipo: "PORCENTAJE",
        signo_esperado: "VARIABLE",
        activo: true
    },
    {
        concepto_estandar: "MARGEN_EBIT",
        categoria: "RATIO",
        alias_sec: "CALCULADO",
        alias_edinet: "CALCULADO",
        alias_finmind: "CALCULADO",
        descripcion: "EBIT dividido entre ingresos.",
        unidad_tipo: "PORCENTAJE",
        signo_esperado: "VARIABLE",
        activo: true
    },
    {
        concepto_estandar: "MARGEN_EBITDA",
        categoria: "RATIO",
        alias_sec: "CALCULADO",
        alias_edinet: "CALCULADO",
        alias_finmind: "CALCULADO",
        descripcion: "EBITDA dividido entre ingresos.",
        unidad_tipo: "PORCENTAJE",
        signo_esperado: "VARIABLE",
        activo: true
    },
    {
        concepto_estandar: "MARGEN_NETO",
        categoria: "RATIO",
        alias_sec: "CALCULADO",
        alias_edinet: "CALCULADO",
        alias_finmind: "CALCULADO",
        descripcion: "Beneficio neto dividido entre ingresos.",
        unidad_tipo: "PORCENTAJE",
        signo_esperado: "VARIABLE",
        activo: true
    },
    {
        concepto_estandar: "MARGEN_FCF",
        categoria: "RATIO",
        alias_sec: "CALCULADO",
        alias_edinet: "CALCULADO",
        alias_finmind: "CALCULADO",
        descripcion: "Free Cash Flow dividido entre ingresos.",
        unidad_tipo: "PORCENTAJE",
        signo_esperado: "VARIABLE",
        activo: true
    },
    {
        concepto_estandar: "ROA",
        categoria: "RATIO",
        alias_sec: "CALCULADO",
        alias_edinet: "CALCULADO",
        alias_finmind: "CALCULADO",
        descripcion: "Rentabilidad sobre activos.",
        unidad_tipo: "PORCENTAJE",
        signo_esperado: "VARIABLE",
        activo: true
    },
    {
        concepto_estandar: "ROE",
        categoria: "RATIO",
        alias_sec: "CALCULADO",
        alias_edinet: "CALCULADO",
        alias_finmind: "CALCULADO",
        descripcion: "Rentabilidad sobre patrimonio neto.",
        unidad_tipo: "PORCENTAJE",
        signo_esperado: "VARIABLE",
        activo: true
    },
    {
        concepto_estandar: "COBERTURA_INTERESES",
        categoria: "RATIO",
        alias_sec: "CALCULADO",
        alias_edinet: "CALCULADO",
        alias_finmind: "CALCULADO",
        descripcion: "EBIT dividido entre gasto por intereses. Base del rating sintetico.",
        unidad_tipo: "VECES",
        signo_esperado: "VARIABLE",
        activo: true
    },
    {
        concepto_estandar: "DEUDA_SOBRE_PATRIMONIO",
        categoria: "RATIO",
        alias_sec: "CALCULADO",
        alias_edinet: "CALCULADO",
        alias_finmind: "CALCULADO",
        descripcion: "Deuda total dividida entre patrimonio neto.",
        unidad_tipo: "PORCENTAJE",
        signo_esperado: "VARIABLE",
        activo: true
    },
    {
        concepto_estandar: "DEUDA_SOBRE_ACTIVOS",
        categoria: "RATIO",
        alias_sec: "CALCULADO",
        alias_edinet: "CALCULADO",
        alias_finmind: "CALCULADO",
        descripcion: "Deuda total dividida entre activos totales.",
        unidad_tipo: "PORCENTAJE",
        signo_esperado: "VARIABLE",
        activo: true
    },
    {
        concepto_estandar: "PASIVO_SOBRE_ACTIVOS",
        categoria: "RATIO",
        alias_sec: "CALCULADO",
        alias_edinet: "CALCULADO",
        alias_finmind: "CALCULADO",
        descripcion: "Pasivo total dividido entre activos totales.",
        unidad_tipo: "PORCENTAJE",
        signo_esperado: "VARIABLE",
        activo: true
    },
    {
        concepto_estandar: "CAPITAL_CIRCULANTE_OPERATIVO",
        categoria: "RATIO",
        alias_sec: "CALCULADO",
        alias_edinet: "CALCULADO",
        alias_finmind: "CALCULADO",
        descripcion: "Inventarios mas cuentas a cobrar menos cuentas a pagar.",
        unidad_tipo: "MONEDA",
        signo_esperado: "VARIABLE",
        activo: true
    },
    {
        concepto_estandar: "CAPITAL_CIRCULANTE_OPERATIVO_SOBRE_INGRESOS",
        categoria: "RATIO",
        alias_sec: "CALCULADO",
        alias_edinet: "CALCULADO",
        alias_finmind: "CALCULADO",
        descripcion: "Capital circulante operativo dividido entre ingresos.",
        unidad_tipo: "PORCENTAJE",
        signo_esperado: "VARIABLE",
        activo: true
    }
];

// ============================================================================
// 3. UPSERT TAXONOMIA
// ============================================================================

async function insertarActualizarTaxonomiaConcepto() {
    const db = conexion as any;

    console.log("\n==============================================");
    console.log(" TAXONOMIA_CONCEPTO - CARGA MAESTRA");
    console.log("==============================================");

    let insertadosActualizados = 0;
    let errores = 0;

    for (const concepto of TAXONOMIA_CONCEPTOS) {
        try {
            await db.query(
                `
                INSERT INTO taxonomia_concepto (
                    concepto_estandar,
                    categoria,
                    alias_sec,
                    alias_edinet,
                    alias_finmind,
                    descripcion,
                    unidad_tipo,
                    signo_esperado,
                    activo
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE
                    categoria = VALUES(categoria),
                    alias_sec = VALUES(alias_sec),
                    alias_edinet = VALUES(alias_edinet),
                    alias_finmind = VALUES(alias_finmind),
                    descripcion = VALUES(descripcion),
                    unidad_tipo = VALUES(unidad_tipo),
                    signo_esperado = VALUES(signo_esperado),
                    activo = VALUES(activo)
                `,
                [
                    concepto.concepto_estandar,
                    concepto.categoria,
                    concepto.alias_sec ?? null,
                    concepto.alias_edinet ?? null,
                    concepto.alias_finmind ?? null,
                    concepto.descripcion,
                    concepto.unidad_tipo,
                    concepto.signo_esperado,
                    concepto.activo
                ]
            );

            insertadosActualizados++;
        } catch (error) {
            errores++;

            console.error(
                `[TAXONOMIA] Error ${concepto.concepto_estandar}:`,
                error instanceof Error ? error.message : String(error)
            );
        }
    }

    console.log("\n[TAXONOMIA] RESUMEN");
    console.log(`- Conceptos definidos: ${TAXONOMIA_CONCEPTOS.length}`);
    console.log(`- Procesados correctamente: ${insertadosActualizados}`);
    console.log(`- Errores: ${errores}`);

    return {
        definidos: TAXONOMIA_CONCEPTOS.length,
        procesados: insertadosActualizados,
        errores
    };
}

// ============================================================================
// 4. ENDPOINT EXPRESS
// POST /api/taxonomia-concepto/actualizar
// ============================================================================

export async function actualizarTaxonomiaConcepto(_req: Request, res: Response): Promise<void> {
    try {
        const resultado = await insertarActualizarTaxonomiaConcepto();

        res.status(200).json({
            ok: true,
            mensaje: "TAXONOMIA_CONCEPTO actualizada correctamente.",
            resumen: resultado
        });
    } catch (error) {
        console.error("[TAXONOMIA] ERROR CRITICO:", error);

        res.status(500).json({
            ok: false,
            mensaje: "No se pudo actualizar TAXONOMIA_CONCEPTO.",
            error: error instanceof Error ? error.message : String(error)
        });
    }
}

// ============================================================================
// 5. EJECUCION DIRECTA
//
// Solo se ejecuta al lanzar este fichero directamente, no al importarlo
// desde el servidor Express.
//
// Para ejecutar manualmente:
// npx ts-node insercionDatosTaxonomia.ts
// ============================================================================

if (require.main === module) {
    insertarActualizarTaxonomiaConcepto()
        .then(resultado => {
            console.log("\n=== TAXONOMIA_CONCEPTO FINALIZADA ===");
            console.log(resultado);
        })
        .catch(error => {
            console.error("\n=== ERROR CRITICO TAXONOMIA_CONCEPTO ===", error);
            process.exitCode = 1;
        });
}