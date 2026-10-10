import path from "path";
import fs from "fs";
import conexion from "../../conexion/bd";
import { obtenerPlantillaPorSector } from "./mapeoSectores";

/**
 * G2EXCHANGE
 * Servicio de integración del motor financiero v1.5
 *
 * PRIORIDAD DE DATOS:
 *
 * 1. MySQL proporciona los datos históricos.
 * 2. El payload manual sobrescribe las hipótesis autorizadas.
 * 3. El motor recibe el ModeloInput definitivo.
 *
 * Este servicio NO modifica MySQL.
 */

// ============================================================
// TIPOS
// ============================================================

interface Evidencia {
    value: number;
    source: string;
    reference_date: string;
}

interface FinanzasTTM {
    fiscal_year: number;
    period_end_date?: string;

    revenue: number;
    ebit: number;
    da: number;

    ebitda?: number;
    net_income?: number;
    taxes_paid?: number;

    capex?: number;
    nwc_balance?: number;
    change_nwc?: number;

    operating_cash_flow?: number;
    free_cash_flow?: number;

    cash?: number;
    gross_debt?: number;
    equity?: number;
    total_assets?: number;
    total_liabilities?: number;

    dividends?: number;
    diluted_shares?: number;
}

type Escenario =
    | "CONSERVATIVE"
    | "BASE"
    | "OPTIMISTIC";

type FactorWacc =
    | "prima_iliquidez"
    | "prima_tamano"
    | "prima_concentracion_clientes"
    | "otros_ajustes_wacc";

type AjustesWacc = Record<
    Escenario,
    Record<FactorWacc, Evidencia>
>;

interface HipotesisEmpresa {
    terminal_roic?: Evidencia;
    terminal_ebit_margin?: Evidencia;
    sustainable_revenue_growth?: Evidencia;
}

interface SobrescriturasValoracion {
    sector_beta?: number;

    ttm_financials?: FinanzasTTM;

    ttm_source?: string;
    ttm_reference_date?: string;
    latest_financial_period_end?: string;

    terminal_roic?: Evidencia;
    terminal_ebit_margin?: Evidencia;

    company_assumptions?: HipotesisEmpresa;

    discount_convention?: "YEAR_END" | "MID_YEAR";

    premium_methodology?:
        | "AUDITED_POLICY"
        | "MANUAL_APPROVED"
        | "DRAFT_POLICY"
        | "SIMULATION_ONLY";

    wacc_adjustments?: AjustesWacc;
}

interface OpcionesImportacion {
    financialUnit: "UNITS" | "MILLIONS";
    sharesUnit: "UNITS" | "MILLIONS";
    templateCode: string;

    changeNwcMillions?: [
        number | undefined,
        number | undefined,
        number | undefined,
        number | undefined
    ];

    riskInputs?: Record<string, Evidencia>;

    sectorSpecific?: {
        next_dividends_millions?: number;
        long_term_dividend_growth?: number;
        affo_fy0_millions?: number;
        affo_growth?: number;
    };
}

// ============================================================
// VALIDACIONES
// ============================================================

function validarNumero(
    valor: number,
    nombre: string,
    minimo: number,
    maximo: number
): void {
    if (
        typeof valor !== "number" ||
        !Number.isFinite(valor) ||
        valor < minimo ||
        valor > maximo
    ) {
        throw new Error(
            `${nombre}: valor numérico inválido`
        );
    }
}

function validarEvidencia(
    evidencia: Evidencia,
    nombre: string,
    minimo: number,
    maximo: number
): void {
    if (
        !evidencia ||
        typeof evidencia !== "object" ||
        typeof evidencia.source !== "string" ||
        evidencia.source.trim().length === 0 ||
        typeof evidencia.reference_date !== "string" ||
        !/^\d{4}-\d{2}-\d{2}$/.test(
            evidencia.reference_date
        )
    ) {
        throw new Error(
            `${nombre}: fuente y fecha obligatorias`
        );
    }

    validarNumero(
        evidencia.value,
        nombre,
        minimo,
        maximo
    );
}

function validarTTM(ttm: FinanzasTTM): void {
    if (
        !ttm ||
        typeof ttm !== "object" ||
        !Number.isInteger(ttm.fiscal_year)
    ) {
        throw new Error(
            "TTM: ejercicio fiscal inválido"
        );
    }

    if (
        !ttm.period_end_date ||
        !/^\d{4}-\d{2}-\d{2}$/.test(
            ttm.period_end_date
        ) ||
        !Number.isFinite(
            Date.parse(ttm.period_end_date)
        )
    ) {
        throw new Error(
            "TTM: fecha de cierre inválida"
        );
    }

    validarNumero(
        ttm.revenue,
        "TTM revenue",
        0.000001,
        Number.MAX_VALUE
    );

    validarNumero(
        ttm.ebit,
        "TTM EBIT",
        -Number.MAX_VALUE,
        Number.MAX_VALUE
    );

    validarNumero(
        ttm.da,
        "TTM DA",
        0,
        Number.MAX_VALUE
    );

    if (ttm.nwc_balance === undefined) {
        throw new Error(
            "TTM: falta nwc_balance"
        );
    }

    validarNumero(
        ttm.nwc_balance,
        "TTM NWC",
        -Number.MAX_VALUE,
        Number.MAX_VALUE
    );

    if (ttm.capex !== undefined) {
        validarNumero(
            ttm.capex,
            "TTM CAPEX",
            0,
            Number.MAX_VALUE
        );
    }

    if (ttm.change_nwc !== undefined) {
        validarNumero(
            ttm.change_nwc,
            "TTM cambio NWC",
            -Number.MAX_VALUE,
            Number.MAX_VALUE
        );
    }
}

// ============================================================
// LOCALIZAR MOTOR COMPILADO
// ============================================================

export function obtenerRutaMotor(): string {

    const rutaMotor = path.resolve(
        process.cwd(),
        "..",
        "valuation_engine",
        "dist",
        "src",
        "modelo.js"
    );

    if (!fs.existsSync(rutaMotor)) {
        throw new Error(
            `No se encuentra el motor financiero en: ${rutaMotor}`
        );
    }

    return rutaMotor;
}

// ============================================================
// CARGAR ADAPTADOR MYSQL
// ============================================================

export function obtenerAdaptadorMySQL() {

    const rutaMotor = obtenerRutaMotor();

    const rutaAdaptador = path.join(
        path.dirname(rutaMotor),
        "integracion",
        "mysql_readonly.js"
    );

    if (!fs.existsSync(rutaAdaptador)) {
        throw new Error(
            `No se encuentra el adaptador MySQL en: ${rutaAdaptador}`
        );
    }

    const adaptador = require(rutaAdaptador);

    if (
        typeof adaptador.exportarInputDesdeRun !==
        "function"
    ) {
        throw new Error(
            "El adaptador MySQL no exporta exportarInputDesdeRun"
        );
    }

    return adaptador;
}

// ============================================================
// IMPORTACIÓN Y FUSIÓN DE DATOS
// ============================================================

export async function importarDatosValoracion(
    runId: number,
    opciones: OpcionesImportacion,
    payload: SobrescriturasValoracion = {}
) {

    const adaptador = obtenerAdaptadorMySQL();

    // --------------------------------------------------------
    // 1. DATOS HISTÓRICOS MYSQL
    // --------------------------------------------------------

    const input = await adaptador.exportarInputDesdeRun(
        conexion,
        runId,
        opciones
    );

    // --------------------------------------------------------
    // 2. BETA MANUAL
    // --------------------------------------------------------

    if (payload.sector_beta !== undefined) {

        validarNumero(
            payload.sector_beta,
            "sector_beta",
            0.01,
            5
        );

        input.sector_beta = payload.sector_beta;
    }

    // --------------------------------------------------------
    // 3. TTM MANUAL
    // --------------------------------------------------------

    if (payload.ttm_financials !== undefined) {

        validarTTM(payload.ttm_financials);

        const ultimoFY = input.financials[3];

        if (!ultimoFY?.period_end_date) {
            throw new Error(
                "No existe fecha del último FY para validar TTM"
            );
        }

        const dias = (
            Date.parse(
                payload.ttm_financials.period_end_date!
            ) -
            Date.parse(ultimoFY.period_end_date)
        ) / 86400000;

        if (
            !Number.isFinite(dias) ||
            dias <= 0 ||
            dias > 366
        ) {
            throw new Error(
                "TTM: fecha incompatible con último FY"
            );
        }

        input.ttm_financials = {
            ...payload.ttm_financials
        };

        input.latest_financial_period_end =
            payload.ttm_financials.period_end_date;

        if (payload.ttm_source !== undefined) {
            input.ttm_source = payload.ttm_source;
        }

        if (
            payload.ttm_reference_date !== undefined
        ) {
            input.ttm_reference_date =
                payload.ttm_reference_date;
        }
    }

    // --------------------------------------------------------
    // 4. HIPÓTESIS ESPECÍFICAS DE EMPRESA
    // --------------------------------------------------------

    const hipotesis: HipotesisEmpresa = {
        ...(payload.company_assumptions ?? {})
    };

    // Admitir también campos directos en el JSON.

    if (payload.terminal_roic !== undefined) {
        hipotesis.terminal_roic =
            payload.terminal_roic;
    }

    if (
        payload.terminal_ebit_margin !== undefined
    ) {
        hipotesis.terminal_ebit_margin =
            payload.terminal_ebit_margin;
    }

    if (hipotesis.terminal_roic !== undefined) {
        validarEvidencia(
            hipotesis.terminal_roic,
            "terminal_roic",
            0.001,
            2
        );
    }

    if (
        hipotesis.terminal_ebit_margin !== undefined
    ) {
        validarEvidencia(
            hipotesis.terminal_ebit_margin,
            "terminal_ebit_margin",
            -0.30,
            0.85
        );
    }

    if (
        hipotesis.sustainable_revenue_growth !==
        undefined
    ) {
        validarEvidencia(
            hipotesis.sustainable_revenue_growth,
            "sustainable_revenue_growth",
            -0.05,
            0.15
        );
    }

    input.company_assumptions = {
        ...(input.company_assumptions ?? {}),
        ...hipotesis
    };

    // --------------------------------------------------------
    // 5. CONVENCIÓN DE DESCUENTO
    // --------------------------------------------------------

    if (
        payload.discount_convention !== undefined
    ) {

        if (
            payload.discount_convention !== "YEAR_END" &&
            payload.discount_convention !== "MID_YEAR"
        ) {
            throw new Error(
                "discount_convention inválida"
            );
        }

        input.discount_convention =
            payload.discount_convention;
    }

    // --------------------------------------------------------
    // 6. AJUSTES DEL WACC
    // --------------------------------------------------------

    if (
        payload.premium_methodology !== undefined
    ) {
        const metodologiasPermitidas = [
            "AUDITED_POLICY",
            "MANUAL_APPROVED",
            "DRAFT_POLICY",
            "SIMULATION_ONLY"
        ];

        if (
            !metodologiasPermitidas.includes(
                payload.premium_methodology
            )
        ) {
            throw new Error(
                "premium_methodology inválida"
            );
        }

        input.premium_methodology =
            payload.premium_methodology;
    }

    if (
        payload.wacc_adjustments !== undefined
    ) {

        const escenarios: Escenario[] = [
            "CONSERVATIVE",
            "BASE",
            "OPTIMISTIC"
        ];

        const factores: FactorWacc[] = [
            "prima_iliquidez",
            "prima_tamano",
            "prima_concentracion_clientes",
            "otros_ajustes_wacc"
        ];

        for (const escenario of escenarios) {

            const ajustes =
                payload.wacc_adjustments[escenario];

            if (!ajustes) {
                throw new Error(
                    `Faltan ajustes WACC: ${escenario}`
                );
            }

            for (const factor of factores) {

                validarEvidencia(
                    ajustes[factor],
                    `${escenario}.${factor}`,
                    -0.50,
                    0.50
                );
            }
        }

        input.wacc_adjustments =
            payload.wacc_adjustments;
    }

    // --------------------------------------------------------
    // 7. DEVOLVER MODELO DEFINITIVO
    // --------------------------------------------------------

    return input;
}

// ============================================================
// RESOLVER PLANTILLA FINANCIERA
// ============================================================

export function resolverPlantillaFinanciera(
    sectorId: number
): string {

    return obtenerPlantillaPorSector(sectorId);
}

// ============================================================
// RESOLVER CONFIGURACIÓN FINANCIERA
// ============================================================

export function resolverConfiguracionFinanciera(
    sectorId: number
): {
    templateCode: string;
    valuationMethodFamily: string;
} {

    const templateCode =
        resolverPlantillaFinanciera(sectorId);

    const rutaConfiguraciones = path.resolve(
        __dirname,
        "..",
        "..",
        "..",
        "valuation_engine",
        "generator",
        "sector_configs"
    );

    const archivo = fs
        .readdirSync(rutaConfiguraciones)
        .find(
            nombre =>
                nombre.startsWith(
                    `${templateCode}_`
                ) &&
                nombre.endsWith(".json")
        );

    if (!archivo) {
        throw new Error(
            `No existe configuración financiera para la plantilla ${templateCode}`
        );
    }

    const configuracion = JSON.parse(
        fs.readFileSync(
            path.join(
                rutaConfiguraciones,
                archivo
            ),
            "utf8"
        )
    );

    if (
        configuracion.code !== templateCode
    ) {
        throw new Error(
            `La configuración no coincide con la plantilla ${templateCode}`
        );
    }

    const familiasPermitidas = [
        "FCFF",
        "RESOURCE",
        "PHARMA",
        "BANK",
        "INSURANCE",
        "REIT"
    ];

    if (
        !familiasPermitidas.includes(
            configuracion.family
        )
    ) {
        throw new Error(
            `Familia financiera no válida para la plantilla ${templateCode}`
        );
    }

    return {
        templateCode,
        valuationMethodFamily:
            configuracion.family
    };
}