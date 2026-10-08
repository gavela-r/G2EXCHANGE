import { Request, Response } from "express";
import conexion from "../conexion/bd";
import AdmZip from "adm-zip";
import { parse } from "csv-parse/sync";
import iconv from "iconv-lite";

// ============================================================================
// .ENV
//
// EDINET_API_KEY_1=PEGA_AQUI_TU_API_KEY_1
// EDINET_API_KEY_2=PEGA_AQUI_TU_API_KEY_2
// EDINET_API_KEY_3=PEGA_AQUI_TU_API_KEY_3
// EDINET_PCV_INTERVAL_MS=400
// EDINET_PCV_CONCURRENCIA=12
// EDINET_PCV_TIMEOUT_MS=30000
// EDINET_PCV_MAX_RETRIES=4
//
// La clave es la MISMA que ya utilizaste para INFORME_FINANCIERO Japon.
// ============================================================================

// ============================================================================
// CONFIGURACIÓN JAPON
// ============================================================================

const JP_PCV_EDINET_API_KEYS = [
    process.env.EDINET_API_KEY_1 || "d27f61b9cfe943f38272762ef6343cfe",
    process.env.EDINET_API_KEY_2 || "32ec502f808d4d5b83a1448ce2d6226f",
    process.env.EDINET_API_KEY_3 || "2bdcdc44161941f995fe6917214aff65"
]
    .map(k => String(k).trim())
    .filter((k, i, arr) => k && arr.indexOf(k) === i);

// Intervalo MINIMO entre peticiones de una misma API key.
// Con 3 keys y 400 ms, el techo teorico es ~7.5 req/s en total.
// Si solo configuras 1 o 2 keys, el mismo codigo sigue funcionando sin cambios.
const JP_PCV_INTERVAL_MS = Number(process.env.EDINET_PCV_INTERVAL_MS || "400");
const JP_PCV_CONCURRENCIA = Math.max(1, Number(process.env.EDINET_PCV_CONCURRENCIA || "12"));
const JP_PCV_TIMEOUT_MS = Number(process.env.EDINET_PCV_TIMEOUT_MS || "30000");
const JP_PCV_MAX_RETRIES = Number(process.env.EDINET_PCV_MAX_RETRIES || "4");

// ============================================================================
// CONFIGURACIÓN USA
// ============================================================================

const PCV_SEC_USER_AGENT = process.env.SEC_USER_AGENT || "G2Exchange contacto@tudominio.com";

const PCV_SEC_INTERVALO_MS = Number(process.env.SEC_INTERVALO_MS || "140");
const PCV_SEC_TIMEOUT_MS = Number(process.env.SEC_TIMEOUT_MS || "20000");
const PCV_SEC_MAX_RETRIES = Number(process.env.SEC_MAX_RETRIES || "3");

// ============================================================================
// CONFIGURACIÓN TAIWAN
// ============================================================================

const TWOPT_FINMIND_TOKENS = [

    process.env.FINMIND_TOKEN_1 || "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJ1c2VyX2lkIjoidmljZW50ZS5nYXZlbGFAZ21haWwuY29tIiwiZW1haWwiOiJ2aWNlbnRlLmdhdmVsYUBnbWFpbC5jb20iLCJ0b2tlbl92ZXJzaW9uIjowfQ.YEYE51_UgvZnYg4ND0P1_tYrv-MV-QFtiXEEl0DtHYo",

    process.env.FINMIND_TOKEN_2 || "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJ1c2VyX2lkIjoianVhbmdhcmxvcDIwMDJAZ21haWwuY29tIiwiZW1haWwiOiJqdWFuZ2FybG9wMjAwMkBnbWFpbC5jb20iLCJ0b2tlbl92ZXJzaW9uIjowfQ.7FrSusCnEafRaXc5O1YtAdKGIr4TD5-fM2DdMeCZKU4",

    process.env.FINMIND_TOKEN_3 || "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJ1c2VyX2lkIjoiYWRyaWFuZ2F2ZWxhOTdAZ21haWwuY29tIiwiZW1haWwiOiJhZHJpYW5nYXZlbGE5N0BnbWFpbC5jb20iLCJ0b2tlbl92ZXJzaW9uIjowfQ.-oEqGIBZuKCIkym5dn8TLK3URUyQke9t1Zo5ELlG71I",

    process.env.FINMIND_TOKEN_4 || "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJ1c2VyX2lkIjoianVhbmdhcjIwMDJAZ21haWwuY29tIiwiZW1haWwiOiJqdWFuZ2FyMjAwMkBnbWFpbC5jb20iLCJ0b2tlbl92ZXJzaW9uIjowfQ.Bhrtve4xNDKxGYLoAv66JQnKRCtm_f_RzMZCmkv82Fk",
]
    .map(k => String(k).trim())
    .filter((k, i, arr) => k && arr.indexOf(k) === i);

const TWOPT_YEARS =
    Number(process.env.FINMIND_PCV_YEARS || "4");

const TWOPT_RPM =
    Number(process.env.FINMIND_PCV_RPM || "9");

const TWOPT_TIMEOUT_MS =
    Number(process.env.FINMIND_PCV_TIMEOUT_MS || "20000");

const TWOPT_MAX_RETRIES =
    Number(process.env.FINMIND_PCV_MAX_RETRIES || "1");

// ============================================================================
// TIPOS JAPON
// ============================================================================

interface JPPCVInforme {
    informe_id: number;
    empresa_id: number;
    tipo_periodo: string;
    tipo_documento: string;
    fecha_fin_periodo: string | null;
    fecha_publicacion: string | null;
    doc_id: string;
}

interface JPPCVConceptoDef {
    codigo: string;
    categoria: string;
    // Alias EDINET/J-GAAP/IFRS. Se compara contra el nombre local del elemento XBRL.
    aliases: string[];
}

interface JPPCVFactCSV {
    elemento: string;
    contexto: string;
    unidad: string;
    valor: number;
    nombreOriginal: string;
}

interface JPPCVPartida {
    informeId: number;
    conceptoEstandarId: number;
    conceptoOriginal: string;
    importe: number;
    nivelConfianza: "ALTA" | "MEDIA";
}

// ============================================================================
// TIPOS USA
// ============================================================================

interface PCVInformeUSA {
    informe_id: number;
    empresa_id: number;
    ticker: string;
    tipo_periodo: string;
    tipo_documento: string;
    fecha_fin_periodo: string | null;
    fecha_publicacion: string | null;
    accession: string;
}

interface PCVEmpresaSEC {
    cik_str: number;
    ticker: string;
    title: string;
}

interface PCVConceptoDef {
    codigo: string;
    categoria: string;
    tags: string[];
}

interface PCVCandidatoFact {
    tag: string;
    value: number;
    start: string | null;
    end: string | null;
    filed: string | null;
    form: string | null;
    accn: string | null;
    unit: string;
}

interface PCVPartidaPreparada {
    informeId: number;
    conceptoEstandarId: number;
    conceptoOriginal: string;
    importe: number;
    nivelConfianza: "ALTA" | "MEDIA";
}

// ============================================================================
// TIPOS TAIWAN
// ============================================================================

interface TWOPTInforme {
    informe_id: number;
    empresa_id: number;
    ticker: string;
    tipo_periodo: string;
    fecha_fin_periodo: string;
}

interface TWOPTFact {
    dataset: string;
    date: string;
    type: string;
    origin_name: string;
    value: number;
}

interface TWOPTConcepto {
    codigo: string;
    categoria: string;
    datasets: string[];
    aliases: string[];
}

interface TWOPTPartida {
    informeId: number;
    conceptoEstandarId: number;
    conceptoOriginal: string;
    importe: number;
    nivelConfianza: "ALTA" | "MEDIA";
}

interface TWOPTDividendFact {    
    fechaPago: string;    
    importeTotal: number; 
}

// ============================================================================
// TAXONOMIA NORMALIZADA - JAPON
//
// Se reutilizan los mismos conceptos de USA.
// ATENCION: EDINET puede contener J-GAAP, IFRS, US-GAAP en algunos emisores,
// y extensiones propias. Por eso usamos varios alias por concepto.
// ============================================================================

const JP_PCV_CONCEPTOS: JPPCVConceptoDef[] = [
    {
        codigo: "INGRESOS",
        categoria: "CUENTA_RESULTADOS",
        aliases: [
            "NetSalesSummaryOfBusinessResults",
            "OrdinaryIncomeSummaryOfBusinessResults",
            "OperatingRevenue1SummaryOfBusinessResults",
            "OperatingRevenue2SummaryOfBusinessResults",
            "GrossOperatingRevenueSummaryOfBusinessResults",
            "RevenueIFRSSummaryOfBusinessResults",
            "RevenuesUSGAAPSummaryOfBusinessResults",
            "RevenueKeyFinancialData",
            "NetSalesOfCompletedConstructionContractsCNS",
            "OperatingIncomeINS",
            "RevenueFromContractsWithCustomers",
            "NetSales",
            "Revenue",
            "Revenues",
            "OperatingRevenue",
            "Sales",
            "RevenueIFRS"
        ]
    },
    {
        codigo: "BENEFICIO_BRUTO",
        categoria: "CUENTA_RESULTADOS",
        aliases: ["GrossProfit", "GrossProfitLoss"]
    },
    {
        codigo: "EBIT",
        categoria: "CUENTA_RESULTADOS",
        aliases: [
            "OperatingIncome",
            "OperatingProfitLossIFRS",
            "OperatingIncomeLossUSGAAPSummaryOfBusinessResults",
            "ProfitFromBusinessActivitiesSummaryOfBusinessResults",
            "CoreOperatingIncomeIFRSKeyFinancialData",
            "BusinessProfitIFRSKeyFinancialData",
            "BusinessProfitIFRSSummaryOfBusinessResults",
            "OperatingIncomeLoss",
            "OperatingProfitLoss",
            "OperatingProfit"
        ]
    },
    {
        codigo: "BENEFICIO_NETO",
        categoria: "CUENTA_RESULTADOS",
        aliases: ["ProfitLoss", "ProfitAttributableToOwnersOfParent", "NetIncome", "NetIncomeLoss"]
    },

    // PUNTO 5 - CONTRASTADO EDINET
    // J-GAAP: jppfs_cor:IncomeBeforeIncomeTaxes
    // IFRS/JMIS/US-GAAP: SummaryOfBusinessResults de EDINET
    {
        codigo: "BENEFICIO_ANTES_IMPUESTOS",
        categoria: "CUENTA_RESULTADOS",
        aliases: [
            "IncomeBeforeIncomeTaxes",
            "ProfitLossBeforeTaxIFRSSummaryOfBusinessResults",
            "ProfitLossBeforeTaxJMISSummaryOfBusinessResults",
            "ProfitLossBeforeTaxUSGAAPSummaryOfBusinessResults",
            "ProfitLossBeforeTaxIFRS"
        ]
    },

    // J-GAAP confirmado: jppfs_cor:IncomeTaxes.
    // EDINET también contiene IncomeTaxExpense para presentaciones IFRS.
    {
        codigo: "IMPUESTO_BENEFICIOS",
        categoria: "CUENTA_RESULTADOS",
        aliases: [
            "IncomeTaxes",
            "IncomeTaxExpense",
            "IncomeTaxExpenseIFRS",
            "IncomeTaxesCurrent",
            "CurrentIncomeTaxExpense"
        ]
    },

    // Flujo de caja real preferido. Para IFRS el concepto estándar IAS 7 es
    // DividendsPaidClassifiedAsFinancingActivities.
    // CashDividendsPaidFinCF aparece como extracción CF en implementaciones
    // contrastadas sobre EDINET. El total anunciado se deja como último fallback
    // porque su timing no es idéntico al efectivo pagado.
    {
        codigo: "DIVIDENDOS_PAGADOS",
        categoria: "FLUJO_CAJA",
        aliases: [
            "CashDividendsPaidFinCF",
            "DividendsPaidClassifiedAsFinancingActivities",
            "DividendsPaidToEquityHoldersOfParentClassifiedAsFinancingActivities",
            "DividendsPaidClassifiedAsOperatingActivities",
            "DividendsPaid",
            "TotalAmountOfDividendsDividendsOfSurplus"
        ]
    },

    // EDINET publica TotalNumberOfIssuedSharesSummaryOfBusinessResults.
    // OJO: es "issued shares"; no es weighted-average diluted shares.
    {
        codigo: "ACCIONES_EN_CIRCULACION",
        categoria: "BALANCE",
        aliases: [
            "TotalNumberOfIssuedSharesSummaryOfBusinessResults",
            "TotalNumberOfIssuedShares",
            "NumberOfIssuedShares",
            "NumberOfSharesOutstanding"
        ]
    },

    { 
        codigo: "GASTO_INTERESES",   
        categoria: "CUENTA_RESULTADOS",    
        aliases: [
            "InterestExpensesNOE",
            "FinanceCostsIFRS",
            "InterestExpensesOpeCF",
            "InterestExpenses",
            "InterestExpense",
            "InterestExpenseNonOperating",
            "InterestAndDebtExpense",
            "FinanceCosts",
            "FinanceCost"
        ]
    },
    {
        codigo: "EFECTIVO",
        categoria: "BALANCE",
        aliases: ["CashAndDeposits", "CashAndCashEquivalents", "CashAndCashEquivalentsAtEndOfPeriod"]
    },
    {
        codigo: "ACTIVOS_TOTALES",
        categoria: "BALANCE",
        aliases: ["Assets", "TotalAssets"]
    },
    {
        codigo: "PASIVOS_TOTALES",
        categoria: "BALANCE",
        aliases: ["Liabilities", "TotalLiabilities"]
    },
    {
        codigo: "PATRIMONIO_NETO",
        categoria: "BALANCE",
        aliases: ["NetAssets", "Equity", "EquityAttributableToOwnersOfParent", "TotalEquity"]
    },
    {
        codigo: "DEUDA_CORTO_PLAZO",
        categoria: "BALANCE",
        aliases: [
            "InterestBearingLiabilitiesCLIFRS",
            "BorrowingsCLIFRS",
            "BorrowingsCurrent",
            "CurrentBorrowings",
            "ShortTermBorrowings",
            "ShortTermLoansPayable",
            "CurrentPortionOfLongTermBorrowingsCLIFRS",
            "CurrentPortionOfLongTermLoansPayable",
            "BondsPayableCLIFRS",
            "CurrentPortionOfBonds",
            "ShortTermBondsPayable",
            "CommercialPapersLiabilities",
            "CurrentPortionOfConvertibleBonds",
            "CurrentPortionOfBondsWithSubscriptionRightsToShares",
            "LeaseLiabilitiesCLIFRS",
            "LeaseLiabilitiesCurrent",
            "LeaseObligationsCL"
        ]
    },
    {
        codigo: "DEUDA_LARGO_PLAZO",
        categoria: "BALANCE",
        aliases: [
            "InterestBearingLiabilitiesNCLIFRS",
            "BorrowingsNCLIFRS",
            "BorrowingsNoncurrent",
            "NonCurrentBorrowings",
            "LongTermDebtNCLIFRS",
            "LongTermLoansPayable",
            "LongTermBorrowings",
            "BondsPayableNCLIFRS",
            "BondsPayable",
            "LeaseLiabilitiesNCLIFRS",
            "LeaseLiabilitiesNonCurrent",
            "LeaseLiabilitiesNoncurrent",
            "LeaseObligationsNCL"
        ]
    },
    {
        codigo: "FLUJO_CAJA_OPERATIVO",
        categoria: "FLUJO_CAJA",
        aliases: [
            "NetCashProvidedByUsedInOperatingActivitiesSummaryOfBusinessResults",
            "CashFlowsFromUsedInOperatingActivitiesIFRSSummaryOfBusinessResults",
            "CashFlowsFromUsedInOperatingActivitiesJMISSummaryOfBusinessResults",
            "CashFlowsFromUsedInOperatingActivitiesUSGAAPSummaryOfBusinessResults",
            "NetCashProvidedByUsedInOperatingActivities",
            "CashFlowsFromUsedInOperatingActivitiesIFRS",
            "CashFlowsFromUsedInOperatingActivitiesJMIS",
            "CashFlowsFromUsedInOperatingActivitiesUSGAAP",
            "CashFlowsFromUsedInOperatingActivities",
            "NetCashFromOperatingActivities"
        ]
    },
    {
        codigo: "CAPEX",
        categoria: "FLUJO_CAJA",
        aliases: [
            // J-GAAP / EDINET
            "PurchaseOfPropertyPlantAndEquipmentInvCF",
            "PurchaseOfPropertyPlantAndEquipment",
            "PaymentsForPurchaseOfPropertyPlantAndEquipment",
            "PaymentsToAcquirePropertyPlantAndEquipment",

            // Variantes de activos tangibles
            "PurchaseOfPropertyPlantAndEquipmentAndIntangibleAssetsInvCF",
            "PurchaseOfPropertyPlantAndEquipmentAndIntangibleAssets",
            "PaymentsForPurchaseOfPropertyPlantAndEquipmentAndIntangibleAssets",
            "PurchaseOfNoncurrentAssetsInvCF",

            // IFRS
            "PurchaseOfPropertyPlantAndEquipmentClassifiedAsInvestingActivities",
            "PaymentsToAcquirePropertyPlantAndEquipmentClassifiedAsInvestingActivities"
        ]
    },
    {
        codigo: "DEPRECIACION_AMORTIZACION",
        categoria: "FLUJO_CAJA",
        aliases: [
            // J-GAAP / EDINET
            "DepreciationAndAmortization",
            "DepreciationAndAmortizationOpeCF",
            "DepreciationOpeCF",
            "DepreciationAndOtherAmortizationOpeCF",
            "Depreciation",
            "DepreciationExpense",
            "DepreciationAndAmortizationExpense",

            // IFRS / variantes ortográficas
            "DepreciationAndAmortizationOpeCFIFRS",
            "DepreciationExpenseOpeCFIFRS",
            "DepreciationAndAmortisation",
            "DepreciationAndAmortisationExpense",
            "DepreciationAmortisationAndImpairmentLoss",
            "DepreciationAmortisationAndImpairmentLossReversalOfImpairmentLoss",
            "DepreciationDepletionAndAmortization"
        ]
    },
    {
        codigo: "INVENTARIOS",
        categoria: "BALANCE",
        aliases: [
            // Genéricos
            "Inventories",
            "Inventory",

            // J-GAAP / EDINET
            "InventoriesForSale",
            "MerchandiseAndFinishedGoods",
            "Merchandise",
            "FinishedGoods",
            "WorkInProcess",
            "RawMaterialsAndSupplies",
            "RawMaterials",
            "Supplies",

            // IFRS
            "InventoriesCurrent",
            "CurrentInventories"
        ]
    },
    {
        codigo: "CUENTAS_COBRAR",
        categoria: "BALANCE",
        aliases: [
            "NotesAndAccountsReceivableTradeAndContractAssetsNet",
            "NotesAndAccountsReceivableTradeAndContractAssets",
            "NotesAndAccountsReceivableTradeNet",
            "NotesAndAccountsReceivableTrade",
            "TradeAndOtherReceivables",
            "TradeReceivables",
            "AccountsReceivableTradeNet",
            "AccountsReceivableTrade",
            "NotesReceivableTradeNet",
            "NotesReceivableTrade"
        ]
    },
    {
        codigo: "CUENTAS_PAGAR",
        categoria: "BALANCE",
        aliases: [
            // Agregados — prioridad
            "TradeAndOtherPayables",
            "TradeAndOtherPayablesCurrent",
            "NotesAndAccountsPayableTrade",
            "NotesAndOperatingAccountsPayableTrade",

            // Cuentas comerciales
            "AccountsPayableTrade",
            "AccountsPayableTradeCurrent",
            "OperatingAccountsPayable",

            // Documentos + cuentas comerciales
            "NotesAndAccountsPayableTradeCurrent",
            "NotesPayableAccountsPayableForConstructionContractsCNS",
            "NotesPayableAccountsPayableForConstructionContractsAndOtherCNS",

            // IFRS / variantes agregadas
            "TradePayables",
            "TradePayablesCurrent"
        ]
    },
    {
        codigo: "EPS_DILUIDO",
        categoria: "CUENTA_RESULTADOS",
        aliases: ["DilutedEarningsPerShare", "EarningsPerShareDiluted", "DilutedEarningsLossPerShare"]
    }
];

// ============================================================================
// UTILIDADES JAPON
// ============================================================================

function jpPcvDormir(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function jpPcvFecha(valor: unknown): string | null {
    if (!valor) return null;

    const s = String(valor).trim().slice(0, 10);

    return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

function jpPcvNumero(valor: unknown): number | null {
    if (valor === null || valor === undefined) {
        return null;
    }

    let texto = String(valor).trim().replace(/,/g, "").replace(/\s/g, "");

    if (texto === "" || texto === "-" || texto === "－") {
        return null;
    }

    // Formato contable: (12345) -> -12345
    if (texto.startsWith("(") && texto.endsWith(")")) {
        texto = "-" + texto.slice(1, -1);
    }

    const n = Number(texto);

    return Number.isFinite(n) ? n : null;
}

function jpPcvElementoLocal(elemento: string): string {
    const limpio = String(elemento || "").trim();

    // jppfs_cor:NetSales / ifrs-full:Revenue -> NetSales / Revenue
    if (limpio.includes(":")) {
        return limpio.split(":").pop() || limpio;
    }

    return limpio;
}

function jpPcvNormalizarTexto(valor: unknown): string {
    return String(valor || "").trim().toLowerCase().replace(/\s+/g, "");
}

// ============================================================================
// FETCH BINARIO EDINET
//
// EDINET puede devolver un ZIP correcto o un JSON de error. Incluso algunos
// errores de la API de documentos pueden venir con HTTP 200, por lo que
// validamos Content-Type.
// ============================================================================

interface JPPCVApiKeyState {
    id: number;
    key: string;
    nextRequestAt: number;
    cooldownUntil: number;
    consecutive429: number;
    totalRequests: number;
    total429: number;
    totalErrors: number;
}

const JP_PCV_API_KEY_STATES: JPPCVApiKeyState[] = JP_PCV_EDINET_API_KEYS.map((key, index) => ({
    id: index + 1,
    key,
    nextRequestAt: 0,
    cooldownUntil: 0,
    consecutive429: 0,
    totalRequests: 0,
    total429: 0,
    totalErrors: 0
}));

/**
 * Reserva la primera API key disponible respetando un intervalo independiente
 * por clave. Si una clave esta en cooldown por 429, los workers usan cualquiera
 * de las otras disponibles. Si todas estan en cooldown, se espera hasta que
 * se recupere la primera.
 */
async function jpPcvAdquirirApiKey(): Promise<JPPCVApiKeyState> {
    if (JP_PCV_API_KEY_STATES.length === 0) {
        throw new Error("Falta al menos una API key EDINET en .env (EDINET_API_KEY_1/2/3)");
    }

    while (true) {
        const ahora = Date.now();
        let mejor: JPPCVApiKeyState | null = null;
        let mejorDisponibleEn = Infinity;

        for (const estado of JP_PCV_API_KEY_STATES) {
            const disponibleEn = Math.max(estado.nextRequestAt, estado.cooldownUntil);

            if (disponibleEn < mejorDisponibleEn) {
                mejor = estado;
                mejorDisponibleEn = disponibleEn;
            }
        }

        if (!mejor) {
            throw new Error("No hay API keys EDINET disponibles.");
        }

        const espera = mejorDisponibleEn - ahora;

        if (espera > 0) {
            await jpPcvDormir(Math.min(espera, 1000));
            continue;
        }

        // La reserva se hace antes de devolver la key para que dos workers no
        // puedan cogerla simultaneamente en el mismo instante.
        mejor.nextRequestAt = ahora + JP_PCV_INTERVAL_MS;
        mejor.totalRequests++;

        return mejor;
    }
}

function jpPcvCooldown429(estado: JPPCVApiKeyState): number {
    estado.total429++;
    estado.consecutive429++;

    const espera = Math.min(15000 * Math.pow(2, estado.consecutive429 - 1), 120000);
    estado.cooldownUntil = Math.max(estado.cooldownUntil, Date.now() + espera);

    return espera;
}

async function jpPcvFetchEdinetZip(docId: string, intento = 0): Promise<Buffer> {
    const estado = await jpPcvAdquirirApiKey();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), JP_PCV_TIMEOUT_MS);

    const url =
        `https://api.edinet-fsa.go.jp/api/v2/documents/${encodeURIComponent(docId)}` +
        `?type=5` +
        `&Subscription-Key=${encodeURIComponent(estado.key)}`;

    try {
        const response = await fetch(url, {
            headers: { "Accept": "application/octet-stream" },
            signal: controller.signal
        });

        if (response.status === 429) {
            const espera = jpPcvCooldown429(estado);

            console.warn(
                `[JP PCV] Key ${estado.id} -> 429. Cooldown ${espera} ms. ` +
                `Intento ${intento + 1}/${JP_PCV_MAX_RETRIES + 1}.`
            );

            if (intento < JP_PCV_MAX_RETRIES) {
                // No dormimos aqui: el siguiente intento intentara usar
                // automaticamente otra key disponible.
                return jpPcvFetchEdinetZip(docId, intento + 1);
            }

            throw new Error(`EDINET HTTP 429 tras ${intento + 1} intentos`);
        }

        if (response.status >= 500) {
            estado.totalErrors++;

            if (intento < JP_PCV_MAX_RETRIES) {
                const espera = Math.min(2000 * Math.pow(2, intento), 30000);
                estado.cooldownUntil = Math.max(estado.cooldownUntil, Date.now() + espera);

                return jpPcvFetchEdinetZip(docId, intento + 1);
            }
        }

        const contentType = String(response.headers.get("content-type") || "").toLowerCase();
        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        if (contentType.includes("application/json")) {
            const texto = buffer.toString("utf8");

            throw new Error(
                `EDINET devolvio JSON en vez de ZIP (key ${estado.id}): ${texto.slice(0, 500)}`
            );
        }

        if (!response.ok) {
            estado.totalErrors++;
            throw new Error(`EDINET HTTP ${response.status} (key ${estado.id})`);
        }

        // Una respuesta correcta rompe la racha de 429 de esta key.
        estado.consecutive429 = 0;

        return buffer;
    } catch (error) {
        estado.totalErrors++;

        if (intento < JP_PCV_MAX_RETRIES) {
            await jpPcvDormir(Math.min(1000 * Math.pow(2, intento), 10000));
            return jpPcvFetchEdinetZip(docId, intento + 1);
        }

        throw error;
    } finally {
        // Siempre limpiamos el timer, tambien si fetch falla antes de responder.
        clearTimeout(timeout);
    }
}

// ============================================================================
// PREPARAR TAXONOMIA_CONCEPTO - JAPON
// ============================================================================

async function jpPcvPrepararTaxonomia(): Promise<Map<string, number>> {
    const db = conexion as any;

    for (const concepto of JP_PCV_CONCEPTOS) {
        await db.query(
            `
            INSERT INTO taxonomia_concepto (concepto_estandar, categoria)
            VALUES (?, ?)
            ON DUPLICATE KEY UPDATE categoria = VALUES(categoria)
            `,
            [concepto.codigo, concepto.categoria]
        );
    }

    const [rows]: any = await db.query(
        `
        SELECT id, concepto_estandar
        FROM taxonomia_concepto
        WHERE concepto_estandar IN (?)
        `,
        [JP_PCV_CONCEPTOS.map(c => c.codigo)]
    );

    const mapa = new Map<string, number>();

    for (const row of rows) {
        mapa.set(String(row.concepto_estandar), Number(row.id));
    }

    console.log(`[JP PCV] Taxonomia: ${mapa.size}/${JP_PCV_CONCEPTOS.length}`);

    return mapa;
}

// ============================================================================
// CARGAR INFORMES EDINET SIN PARTIDAS
//
// IMPORTANTE: no queremos volver a descargar miles de ZIP cada vez. Solo
// seleccionamos informes EDINET que NO tienen ninguna partida. Si despues
// queréis forzar reprocesado completo, quitad temporalmente el NOT EXISTS.
// ============================================================================

async function jpPcvCargarInformesPendientes(): Promise<JPPCVInforme[]> {
    const db = conexion as any;

    const [rows]: any = await db.query(
        `
        SELECT
            inf.id AS informe_id,
            inf.empresa_id,
            inf.tipo_periodo,
            inf.tipo_documento,
            inf.fecha_fin_periodo,
            inf.fecha_publicacion,
            inf.identificador_fuente AS doc_id
        FROM informe_financiero inf
        WHERE inf.fuente = 'EDINET'
          AND inf.identificador_fuente IS NOT NULL
          AND TRIM(inf.identificador_fuente) <> ''
        ORDER BY inf.fecha_publicacion DESC, inf.id DESC
        `
    );

    const resultado: JPPCVInforme[] = rows.map((row: any) => ({
        informe_id: Number(row.informe_id),
        empresa_id: Number(row.empresa_id),
        tipo_periodo: String(row.tipo_periodo || ""),
        tipo_documento: String(row.tipo_documento || ""),
        fecha_fin_periodo: jpPcvFecha(row.fecha_fin_periodo),
        fecha_publicacion: jpPcvFecha(row.fecha_publicacion),
        doc_id: String(row.doc_id || "").trim()
    }));

    console.log(`[JP PCV] Informes EDINET pendientes: ${resultado.length}`);

    return resultado;
}

// ============================================================================
// DESCARGAR CSV EDINET POR docID
//
// type=5 = ZIP con CSV convertido desde XBRL.
// URL: https://api.edinet-fsa.go.jp/api/v2/documents/{docID}?type=5&Subscription-Key=API_KEY
// ============================================================================

async function jpPcvDescargarCsvZip(docId: string): Promise<Buffer> {
    return await jpPcvFetchEdinetZip(docId);
}

// ============================================================================
// DECODIFICAR CSV
//
// EDINET puede entregar CSV con BOM. Intentamos: UTF-16LE, UTF-8 BOM, UTF-8.
// ============================================================================

function jpPcvDecodificarCsv(buffer: Buffer): string {
    // UTF-16 LE BOM
    if (buffer.length >= 2 && buffer[0] === 0xFF && buffer[1] === 0xFE) {
        return iconv.decode(buffer, "utf16-le");
    }

    // UTF-8 BOM
    if (buffer.length >= 3 && buffer[0] === 0xEF && buffer[1] === 0xBB && buffer[2] === 0xBF) {
        return buffer.slice(3).toString("utf8");
    }

    // EDINET / Windows japonés
    return iconv.decode(buffer, "CP932");
}

// ============================================================================
// LEER TODOS LOS CSV DEL ZIP
// ============================================================================

function jpPcvLeerCsvsZip(zipBuffer: Buffer): Record<string, any>[] {
    const zip = new AdmZip(zipBuffer);
    const filasTotales: Record<string, any>[] = [];
    const entries = zip.getEntries();

    for (const entry of entries) {
        if (entry.isDirectory) continue;

        if (!entry.entryName.toLowerCase().endsWith(".csv")) continue;

        const nombre = entry.entryName.toLowerCase();

        // No necesitamos documentos de auditoría.
        if (nombre.includes("auditdoc")) continue;

        try {
            const raw = entry.getData();

            let texto: string;

            // 1. DETECTAR UTF-16 LE
            if (raw.length >= 2 && raw[0] === 0xFF && raw[1] === 0xFE) {
                texto = iconv.decode(raw, "utf16-le");
            } else {
                // 2. PROBAR SHIFT_JIS / CP932
                texto = iconv.decode(raw, "CP932");
            }

            // Eliminar BOM
            texto = texto.replace(/^\uFEFF/, "");

            // 3. INTENTAR COMA
            let filas: Record<string, any>[] = [];

            try {
                filas = parse(texto, {
                    columns: true,
                    delimiter: ",",
                    skip_empty_lines: true,
                    relax_column_count: true,
                    relax_quotes: true,
                    bom: true,
                    trim: true
                }) as Record<string, any>[];
            } catch {
                // 4. FALLBACK TABULADOR
                filas = parse(texto, {
                    columns: true,
                    delimiter: "\t",
                    skip_empty_lines: true,
                    relax_column_count: true,
                    relax_quotes: true,
                    bom: true,
                    trim: true
                }) as Record<string, any>[];
            }

            if (filas.length > 0) {
                filasTotales.push(...filas);
            }
        } catch (error) {
            console.warn(
                `[JP PCV] No se pudo parsear CSV ${entry.entryName}: ` +
                `${error instanceof Error ? error.message : String(error)}`
            );
        }
    }

    return filasTotales;
}

// ============================================================================
// DETECTAR COLUMNAS DEL CSV EDINET
//
// Dependiendo de version/idioma, los encabezados pueden variar. Buscamos por
// nombre japones, nombre ingles, o fragmentos conocidos.
// ============================================================================

function jpPcvBuscarCampo(fila: Record<string, any>, candidatos: string[]): string | null {
    const claves = Object.keys(fila);

    for (const clave of claves) {
        const normal = jpPcvNormalizarTexto(clave);

        for (const candidato of candidatos) {
            if (normal.includes(jpPcvNormalizarTexto(candidato))) {
                return clave;
            }
        }
    }

    return null;
}

// ============================================================================
// CONVERTIR FILAS CSV A FACTS
// ============================================================================

function jpPcvConvertirFacts(filas: Record<string, any>[]): JPPCVFactCSV[] {
    if (filas.length === 0) {
        return [];
    }

    const muestra = filas[0];

    const campoElemento = jpPcvBuscarCampo(muestra, ["要素ID", "elementid", "element", "項目ID"]);
    const campoNombre = jpPcvBuscarCampo(muestra, ["項目名", "itemname", "label", "科目名"]);
    const campoContexto = jpPcvBuscarCampo(muestra, ["コンテキストID", "contextid", "context"]);
    const campoUnidad = jpPcvBuscarCampo(muestra, ["単位ID", "unitid", "unit"]);
    const campoValor = jpPcvBuscarCampo(muestra, ["値", "value", "金額"]);

    if (!campoElemento || !campoValor) {
        console.warn("[JP PCV] No se detectaron columnas elemento/valor.");
        console.warn("[JP PCV] Encabezados detectados:", Object.keys(muestra));

        return [];
    }

    const facts: JPPCVFactCSV[] = [];

    for (const fila of filas) {
        const elemento = String(fila[campoElemento] || "").trim();

        if (!elemento) continue;

        const valor = jpPcvNumero(fila[campoValor]);

        if (valor === null) continue;

        facts.push({
            elemento,
            contexto: campoContexto ? String(fila[campoContexto] || "").trim() : "",
            unidad: campoUnidad ? String(fila[campoUnidad] || "").trim() : "",
            valor,
            nombreOriginal: campoNombre ? String(fila[campoNombre] || elemento).trim() : elemento
        });
    }

    return facts;
}

// ============================================================================
// SCORE DE CONTEXTO
//
// EDINET contiene varios contextos: CurrentYearDuration, CurrentYearInstant,
// CurrentQuarterDuration, Prior1Year..., Consolidated / NonConsolidated.
// Queremos: PERIODO ACTUAL, CONSOLIDADO cuando exista, evitar Previous/Prior.
// ============================================================================

function jpPcvScoreContexto(
    fact: JPPCVFactCSV,
    informe: JPPCVInforme,
    categoria: string
): number {
    const c = fact.contexto.toLowerCase();
    let score = 0;

    // Penalizar comparativos anteriores.
    if (c.includes("prior") || c.includes("previous")) {
        score -= 200;
    }

    // Preferir actual.
    if (c.includes("current")) {
        score += 60;
    }

    // Preferir consolidado.
    if (c.includes("consolidated") && !c.includes("nonconsolidated")) {
        score += 40;
    }

    // Penalizar no consolidado si existe alternativa.
    if (c.includes("nonconsolidated") || c.includes("non-consolidated")) {
        score -= 30;
    }

    if (categoria === "BALANCE") {
        if (c.includes("instant")) {
            score += 30;
        }
    } else {
        if (c.includes("duration")) {
            score += 30;
        }
    }

    const tipo = informe.tipo_periodo.toUpperCase();

    if (tipo === "ANUAL") {
        if (c.includes("year")) {
            score += 30;
        }
    } else if (tipo === "SEMESTRAL") {
        if (c.includes("semi") || c.includes("half")) {
            score += 30;
        }
    } else if (tipo === "TRIMESTRAL") {
        if (c.includes("quarter")) {
            score += 30;
        }
    }

    // Preferencia ligera por JPY / yen.
    const unidad = fact.unidad.toUpperCase();

    if (unidad.includes("JPY") || unidad.includes("YEN")) {
        score += 10;
    }

    return score;
}

// ============================================================================
// BUSCAR UN CONCEPTO - JAPON
// ============================================================================

function jpPcvBuscarConcepto(
    facts: JPPCVFactCSV[],
    definicion: JPPCVConceptoDef,
    informe: JPPCVInforme
): { fact: JPPCVFactCSV; aliasIndex: number } | null {
    let mejor: JPPCVFactCSV | null = null;
    let mejorScore = -Infinity;
    let mejorAliasIndex = -1;

    for (let aliasIndex = 0; aliasIndex < definicion.aliases.length; aliasIndex++) {
        const alias = definicion.aliases[aliasIndex].toLowerCase();

        for (const fact of facts) {
            const local = jpPcvElementoLocal(fact.elemento).toLowerCase();

            // Coincidencia exacta preferida.
            let scoreAlias = -1;

            if (local === alias) {
                scoreAlias = 100;
            } else if (local.endsWith(alias)) {
                scoreAlias = 80;
            } else {
                continue;
            }

            const scoreContexto = jpPcvScoreContexto(fact, informe, definicion.categoria);

            // Primer alias = mayor prioridad.
            const scorePrioridad = Math.max(0, 20 - aliasIndex * 3);

            const score = scoreAlias + scoreContexto + scorePrioridad;

            if (score > mejorScore) {
                mejorScore = score;
                mejor = fact;
                mejorAliasIndex = aliasIndex;
            }
        }
    }

    if (!mejor) {
        return null;
    }

    return { fact: mejor, aliasIndex: mejorAliasIndex };
}

// ============================================================================
// EXTRAER PARTIDAS DE UN INFORME - JAPON
// ============================================================================

function jpPcvExtraerPartidas(
    facts: JPPCVFactCSV[],
    informe: JPPCVInforme,
    taxonomiaIds: Map<string, number>
): JPPCVPartida[] {
    const resultado: JPPCVPartida[] = [];

    for (const definicion of JP_PCV_CONCEPTOS) {
        const conceptoId = taxonomiaIds.get(definicion.codigo);

        if (!conceptoId) continue;

        const encontrado = jpPcvBuscarConcepto(facts, definicion, informe);

        if (!encontrado) continue;

        resultado.push({
            informeId: informe.informe_id,
            conceptoEstandarId: conceptoId,
            conceptoOriginal: encontrado.fact.elemento,
            importe: encontrado.fact.valor,
            nivelConfianza: encontrado.aliasIndex === 0 ? "ALTA" : "MEDIA"
        });
    }

    return resultado;
}

// ============================================================================
// GUARDAR PARTIDAS - JAPON
// ============================================================================

async function jpPcvGuardarPartidas(partidas: JPPCVPartida[]): Promise<number> {
    if (partidas.length === 0) {
        return 0;
    }

    const db = conexion as any;
    const mapa = new Map<string, JPPCVPartida>();

    for (const p of partidas) {
        mapa.set(`${p.informeId}|${p.conceptoEstandarId}`, p);
    }

    const valores = Array.from(mapa.values()).map(p => [
        p.informeId,
        p.conceptoEstandarId,
        p.conceptoOriginal,
        p.importe,
        p.nivelConfianza
    ]);

    const [resultado]: any = await db.query(
        `
        INSERT INTO partida_contable_valor (
            informe_id,
            concepto_estandar_id,
            concepto,
            importe,
            nivel_confianza
        )
        VALUES ?
        ON DUPLICATE KEY UPDATE
            concepto = VALUES(concepto),
            importe = VALUES(importe),
            nivel_confianza = VALUES(nivel_confianza)
        `,
        [valores]
    );

    return Number(resultado?.affectedRows || valores.length);
}

// ============================================================================
// MOTOR PRINCIPAL - JAPON
// ============================================================================

export async function ejecutarCargaPartidasContablesJapon() {
    if (JP_PCV_EDINET_API_KEYS.length === 0) {
        throw new Error("Falta al menos una API key EDINET en .env (EDINET_API_KEY_1/2/3)");
    }

    const inicio = Date.now();

    console.log("\n======================================================");
    console.log(" PARTIDA_CONTABLE_VALOR - JAPON / EDINET");
    console.log("======================================================");
    console.log(
        `[JP PCV] API keys: ${JP_PCV_EDINET_API_KEYS.length} | ` +
        `workers: ${JP_PCV_CONCURRENCIA} | ` +
        `intervalo/key: ${JP_PCV_INTERVAL_MS} ms`
    );

    const taxonomiaIds = await jpPcvPrepararTaxonomia();
    const informes = await jpPcvCargarInformesPendientes();

    if (informes.length === 0) {
        console.log("[JP PCV] No hay informes pendientes.");

        return {
            informesPendientes: 0,
            informesProcesados: 0,
            informesSinCsv: 0,
            informesSinFacts: 0,
            informesSinPartidas: 0,
            informesError: 0,
            partidasDetectadas: 0,
            operacionesBD: 0,
            apiKeys: JP_PCV_EDINET_API_KEYS.length,
            workers: JP_PCV_CONCURRENCIA,
            duracionMs: Date.now() - inicio
        };
    }

    let informesProcesados = 0;
    let informesSinCsv = 0;
    let informesSinFacts = 0;
    let informesSinPartidas = 0;
    let informesError = 0;
    let partidasDetectadas = 0;
    let operacionesBD = 0;
    let cursor = 0;

    async function procesarInforme(informe: JPPCVInforme): Promise<void> {
        try {
            const zipBuffer = await jpPcvDescargarCsvZip(informe.doc_id);

            let filasCsv: Record<string, any>[] = [];

            try {
                filasCsv = jpPcvLeerCsvsZip(zipBuffer);
            } catch (error) {
                informesSinCsv++;
                console.warn(`[JP PCV] ZIP/CSV no util ${informe.doc_id}`);
                return;
            }

            if (filasCsv.length === 0) {
                informesSinCsv++;
                return;
            }

            const facts = jpPcvConvertirFacts(filasCsv);

            if (facts.length === 0) {
                informesSinFacts++;
                return;
            }

            const partidas = jpPcvExtraerPartidas(facts, informe, taxonomiaIds);

            informesProcesados++;

            if (partidas.length === 0) {
                informesSinPartidas++;
            } else {
                partidasDetectadas += partidas.length;
                operacionesBD += await jpPcvGuardarPartidas(partidas);
            }

            if (informesProcesados % 100 === 0) {
                console.log(
                    `[JP PCV] Informes ${informesProcesados}/${informes.length} | ` +
                    `partidas: ${partidasDetectadas} | ` +
                    `sin CSV: ${informesSinCsv} | ` +
                    `sin partidas: ${informesSinPartidas} | ` +
                    `errores: ${informesError}`
                );
            }
        } catch (error) {
            informesError++;

            console.error(
                `[JP PCV] Error docID ${informe.doc_id}:`,
                error instanceof Error ? error.message : String(error)
            );
        }
    }

    async function worker(workerId: number): Promise<void> {
        while (true) {
            const indice = cursor++;

            if (indice >= informes.length) {
                return;
            }

            const informe = informes[indice];
            await procesarInforme(informe);

            if ((indice + 1) % 500 === 0) {
                console.log(`[JP PCV] Worker ${workerId}: alcanzado indice ${indice + 1}.`);
            }
        }
    }

    const numeroWorkers = Math.min(JP_PCV_CONCURRENCIA, informes.length);

    await Promise.all(
        Array.from({ length: numeroWorkers }, (_, i) => worker(i + 1))
    );

    const duracionMs = Date.now() - inicio;

    console.log("\n[JP PCV] RESUMEN FINAL");
    console.log(`- Informes pendientes iniciales: ${informes.length}`);
    console.log(`- Informes procesados: ${informesProcesados}`);
    console.log(`- Sin CSV: ${informesSinCsv}`);
    console.log(`- Sin facts utilizables: ${informesSinFacts}`);
    console.log(`- Sin partidas mapeadas: ${informesSinPartidas}`);
    console.log(`- Errores: ${informesError}`);
    console.log(`- Partidas detectadas: ${partidasDetectadas}`);
    console.log(`- Operaciones BD: ${operacionesBD}`);
    console.log(`- Tiempo total: ${(duracionMs / 1000).toFixed(1)} s`);

    for (const estado of JP_PCV_API_KEY_STATES) {
        console.log(
            `- Key ${estado.id}: requests=${estado.totalRequests}, ` +
            `429=${estado.total429}, errores=${estado.totalErrors}`
        );
    }

    return {
        informesPendientes: informes.length,
        informesProcesados,
        informesSinCsv,
        informesSinFacts,
        informesSinPartidas,
        informesError,
        partidasDetectadas,
        operacionesBD,
        apiKeys: JP_PCV_API_KEY_STATES.map(estado => ({
            id: estado.id,
            requests: estado.totalRequests,
            http429: estado.total429,
            errores: estado.totalErrors
        })),
        workers: numeroWorkers,
        intervaloPorKeyMs: JP_PCV_INTERVAL_MS,
        duracionMs
    };
}

// ============================================================================
// ENDPOINT EXPRESS - JAPON
// POST /api/partida-contable-valor/japon/actualizar
// ============================================================================

export async function actualizarPartidasContablesJapon(
    _req: Request,
    res: Response
): Promise<void> {
    try {
        const resultado = await ejecutarCargaPartidasContablesJapon();

        res.status(200).json({
            ok: true,
            mensaje: "Carga de PARTIDA_CONTABLE_VALOR Japon finalizada.",
            resumen: resultado
        });
    } catch (error) {
        console.error("[JP PCV] ERROR CRITICO:", error);

        res.status(500).json({
            ok: false,
            mensaje: "No se pudo cargar PARTIDA_CONTABLE_VALOR Japon.",
            error: error instanceof Error ? error.message : String(error)
        });
    }
}

// ============================================================================
// EJECUCION DIRECTA - JAPON (comentado)
//
// Para probar: npx ts-node insercionPartidaContableValor.ts
// Si en el mismo archivo esta USA/Taiwan, dejar activa SOLO una ejecucion.
// ============================================================================

 //ejecutarCargaPartidasContablesJapon()
 //     .then(resultado => {
  //       console.log("\n=== PARTIDA_CONTABLE_VALOR JAPON FINALIZADA ===");
  //       console.log(resultado);
  //   })
  //   .catch(error => {
  //       console.error("\n=== ERROR CRITICO PARTIDA_CONTABLE_VALOR JAPON ===", error);
  //       process.exitCode = 1;
  //   });

// ============================================================================
// TAXONOMIA MINIMA - USA
// ============================================================================

const PCV_CONCEPTOS: PCVConceptoDef[] = [
    {
    codigo: "INGRESOS",
    categoria: "CUENTA_RESULTADOS",
    tags: [
        // =====================================================
        // US-GAAP MODERNO — máxima prioridad
        // =====================================================
        "RevenueFromContractWithCustomerExcludingAssessedTax",
        "RevenueFromContractWithCustomerIncludingAssessedTax",

        // Revenue fuera de ASC 606
        "RevenueNotFromContractWithCustomer",
        "RevenueNotFromContractWithCustomerOther",

        // =====================================================
        // TOTALES GENERALES
        // =====================================================
        "Revenues",
        "SalesRevenueNet",
        "SalesRevenueGoodsNet",
        "SalesRevenueServicesNet",
        "SalesRevenueNetOfReturnsAndAllowances",

        // =====================================================
        // FINANCIERAS / BANCOS / BROKERS
        // =====================================================
        "RevenuesNetOfInterestExpense",
        "RevenuesExcludingInterestAndDividends",
        "FinancialServicesRevenue",
        "InterestAndDividendIncomeOperating",

        // =====================================================
        // HEALTHCARE
        // =====================================================
        "HealthCareOrganizationRevenue",
        "HealthCareOrganizationRevenueNetOfPatientServiceRevenueProvisions",

        // =====================================================
        // UTILITIES / ENERGÍA
        // =====================================================
        "RegulatedAndUnregulatedOperatingRevenue",
        "ElectricUtilityRevenue",

        // =====================================================
        // REAL ESTATE / REIT
        // =====================================================
        "RealEstateRevenueNet",
        "OperatingLeasesIncomeStatementLeaseRevenue",

        // =====================================================
        // MINERÍA / RECURSOS
        // =====================================================
        "RevenueMineralSales",

        // =====================================================
        // PRODUCTOS / INDUSTRIA
        // =====================================================
        "ProductSales",

        // =====================================================
        // FALLBACKS HISTÓRICOS
        // =====================================================
        "Revenue",
        "OperatingRevenue",
        "OperatingRevenues",

        // =====================================================
        // IFRS / 20-F / 40-F
        // =====================================================
        "ifrs-full:Revenue",
        "ifrs-full:RevenueFromContractsWithCustomers"
    ]
},
    
    {
        codigo: "BENEFICIO_BRUTO",
        categoria: "CUENTA_RESULTADOS",
        tags: [
            "GrossProfit",
            "GrossProfitLoss",
            "ifrs-full:GrossProfit"
        ]
    },

   {
    codigo: "EBIT",
    categoria: "CUENTA_RESULTADOS",
    tags: [
        // US-GAAP principal
        "OperatingIncomeLoss",

        // Variantes operativas cercanas / fallback
        "OperatingProfitLoss",
        "OperatingProfit",
        "IncomeLossFromOperations",

        // IFRS
        "ifrs-full:ProfitLossFromOperatingActivities"
    ]
},

    {
    codigo: "BENEFICIO_NETO",
    categoria: "CUENTA_RESULTADOS",
    tags: [
        // US-GAAP principales
        "NetIncomeLoss",
        "ProfitLoss",

        // Fallbacks US-GAAP
        "NetIncomeLossAvailableToCommonStockholdersBasic",
        "IncomeLossFromContinuingOperations",
        "NetIncomeLossAllocatedToGeneralPartners",

        // IFRS
        "ifrs-full:ProfitLoss",
        "ifrs-full:ProfitLossAttributableToOwnersOfParent"
    ]
},

    {
        codigo: "BENEFICIO_ANTES_IMPUESTOS",
        categoria: "CUENTA_RESULTADOS",
        tags: [
            "IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest",
            "IncomeLossFromContinuingOperationsBeforeIncomeTaxesMinorityInterestAndIncomeLossFromEquityMethodInvestments",
            "IncomeLossFromContinuingOperationsBeforeIncomeTaxes",

            // IFRS
            "ifrs-full:ProfitLossBeforeTax"
        ]
    },

    {
        codigo: "IMPUESTO_BENEFICIOS",
        categoria: "CUENTA_RESULTADOS",
        tags: [
            "IncomeTaxExpenseBenefit",

            // IFRS
            "ifrs-full:IncomeTaxExpenseContinuingOperations",
            "ifrs-full:IncomeTaxExpense"
        ]
    },

    {
        codigo: "DIVIDENDOS_PAGADOS",
        categoria: "FLUJO_CAJA",
        tags: [
            "PaymentsOfDividends",
            "PaymentsOfDividendsCommonStock",
            "PaymentsOfOrdinaryDividends",
            "PaymentsOfDividendsPreferredStockAndPreferenceStock",
            "PaymentsOfDividendsMinorityInterest",
            "PaymentsOfCapitalDistribution",

            // Fallbacks desde estado de patrimonio
            "DividendsCommonStockCash",
            "DividendsCash",
            "DividendsCommonStock",
            "Dividends",

            // IFRS
            "ifrs-full:DividendsPaidClassifiedAsFinancingActivities",
            "ifrs-full:DividendsPaid"
        ]
    },

    {
        codigo: "ACCIONES_EN_CIRCULACION",
        categoria: "BALANCE",
        tags: [
            "CommonStockSharesOutstanding",
            "dei:EntityCommonStockSharesOutstanding",
            "SharesOutstanding",

            // IFRS
            "ifrs-full:NumberOfSharesOutstanding"
        ]
    },

    {
    codigo: "GASTO_INTERESES",
    categoria: "CUENTA_RESULTADOS",
    tags: [
        // Totales preferidos
        "InterestExpenseNonOperating",
        "InterestExpense",
        "InterestAndDebtExpense",

        // Deuda
        "InterestExpenseDebt",
        "InterestExpenseLongTermDebt",
        "InterestExpenseBorrowings",
        "InterestExpenseShortTermBorrowings",
        "InterestExpenseDebtExcludingAmortization",
        "InterestExpenseDebtIncludingAmortization",

        // Operativo / financiero
        "InterestExpenseOperating",

        // Bancos / entidades financieras
        "InterestExpenseDeposits",
        "InterestExpenseSubordinatedNotesAndDebentures",

        // Otros tipos
        "InterestExpenseOther",
        "InterestExpenseRelatedParty",
        "InterestCostsIncurred",
        "FinanceLeaseInterestExpense",

        // IFRS
        "ifrs-full:InterestExpense",
        "ifrs-full:FinanceCosts"
    ]
},

    {
        codigo: "EFECTIVO",
        categoria: "BALANCE",
        tags: [
            "CashAndCashEquivalentsAtCarryingValue",
            "CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents",
            "CashAndDueFromBanks",
            "Cash",

            // Fallbacks
            "CashCashEquivalentsAndShortTermInvestments",
            "CashAndCashEquivalentsFairValueDisclosure",

            // IFRS
            "ifrs-full:CashAndCashEquivalents"
        ]
    },

    {
        codigo: "ACTIVOS_TOTALES",
        categoria: "BALANCE",
        tags: [
            "Assets",
            "ifrs-full:Assets"
        ]
    },

    {
        codigo: "PASIVOS_TOTALES",
        categoria: "BALANCE",
        tags: [
            "Liabilities",
            "ifrs-full:Liabilities"
        ]
    },

    {
        codigo: "PATRIMONIO_NETO",
        categoria: "BALANCE",
        tags: [
            "StockholdersEquity",
            "StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest",

            // Partnerships / LLC
            "PartnersCapital",
            "MembersEquity",
            "PartnersCapitalIncludingPortionAttributableToNoncontrollingInterest",

            // IFRS
            "ifrs-full:Equity",
            "ifrs-full:EquityAttributableToOwnersOfParent"
        ]
    },

   {
    codigo: "DEUDA_CORTO_PLAZO",
    categoria: "BALANCE",
    tags: [
        // Agregados - máxima prioridad
        "DebtCurrent",
        "ShortTermBorrowings",

        // Deuda corriente genérica
        "ShortTermDebt",
        "ShortTermLoans",
        "CurrentBorrowings",
        "OtherShortTermBorrowings",

        // Notes / loans
        "NotesAndLoansPayableCurrent",
        "NotesPayableCurrent",
        "LoansPayableCurrent",
        "LoansPayableToBankCurrent",
        "OtherLoansPayableCurrent",

        // Convertible
        "ConvertibleNotesPayableCurrent",
        "ConvertibleDebtCurrent",
        "ConvertibleSubordinatedDebtCurrent",

        // Garantizada / no garantizada
        "SecuredDebtCurrent",
        "UnsecuredDebtCurrent",
        "SubordinatedDebtCurrent",

        // Líneas de crédito / revolving
        "LinesOfCreditCurrent",
        "LineOfCredit",
        "RevolvingCreditFacilityCurrent",

        // Parte corriente de deuda LP
        "LongTermDebtCurrent",
        "LongTermDebtAndFinanceLeaseObligationsCurrent",
        "LongTermDebtAndCapitalLeaseObligationsCurrent",
        "CurrentPortionOfLongTermDebt",
        "CurrentPortionOfLongTermDebtAndCapitalLeaseObligations",

        // Notes / bonds que vencen CP
        "SeniorNotesCurrent",
        "SeniorDebtCurrent",
        "SeniorSecuredNotesCurrent",
        "SeniorUnsecuredNotesCurrent",
        "SubordinatedNotesCurrent",
        "NotesPayableCurrent",

        // Commercial paper
        "CommercialPaper",
        "LongTermCommercialPaperCurrent",

        // Construcción / transición / pollution
        "LongTermConstructionLoanCurrent",
        "LongtermTransitionBondCurrent",
        "LongtermPollutionControlBondCurrent",

        // Leasing financiero
        "FinanceLeaseLiabilityCurrent",
        "CapitalLeaseObligationsCurrent",

        // IFRS
        "ifrs-full:CurrentBorrowings",
        "ifrs-full:CurrentPortionOfLongtermBorrowings",
        "ifrs-full:CurrentLeaseLiabilities"
    ]
},

    {
        codigo: "DEUDA_LARGO_PLAZO",
        categoria: "BALANCE",
        tags: [
            // Agregados no corrientes - máxima prioridad
            "LongTermDebtAndFinanceLeaseObligationsNoncurrent",
            "LongTermDebtNoncurrent",

            // Notes / loans
            "LongTermNotesAndLoans",
            "LongTermNotesPayable",
            "NotesPayableNoncurrent",
            "LongTermLoansPayable",
            "LongTermLoansFromBank",

            // Convertibles
            "ConvertibleNotesPayable",
            "ConvertibleDebtNoncurrent",
            "ConvertibleSubordinatedDebtNoncurrent",

            // Senior / subordinada
            "SeniorNotes",
            "SeniorLongTermNotes",
            "SubordinatedLongTermDebt",

            // Garantizada / no garantizada
            "SecuredDebt",
            "UnsecuredDebt",

            // Líneas de crédito
            "LongTermLineOfCredit",

            // Commercial paper / préstamos
            "CommercialPaperNoncurrent",
            "ConstructionLoanNoncurrent",

            // Otros
            "OtherLongTermDebtNoncurrent",
            "LongTermTransitionBond",
            "LongTermPollutionControlBond",

            // Leasing
            "FinanceLeaseLiabilityNoncurrent",
            "CapitalLeaseObligationsNoncurrent",

            // Totales como último fallback
            "LongTermDebtAndCapitalLeaseObligations",
            "LongTermDebtAndFinanceLeaseObligations",
            "LongTermDebt",
            "LongTermDebtFairValue",
            "NotesPayable",

            // IFRS
            "ifrs-full:NoncurrentPortionOfNoncurrentLoansReceived",
            "ifrs-full:LongtermBorrowings",
            "ifrs-full:NoncurrentLeaseLiabilities",
            "ifrs-full:Borrowings",
            // AÑADIR
            "LongTermDebtAndFinanceLeaseObligations",
            "LongTermDebtAndCapitalLeaseObligationsCurrentAndNoncurrent",

            // Senior / notes
            "SeniorDebtNoncurrent",
            "SeniorNotesNoncurrent",
            "SeniorSecuredNotesNoncurrent",
            "SeniorUnsecuredNotesNoncurrent",
            "SubordinatedNotesNoncurrent",

            // Loans / borrowings
             "BorrowingsNoncurrent",
             "LoansPayableNoncurrent",
             "BankLoansNoncurrent",

             // Revolving / líneas de crédito
             "RevolvingCreditFacilityNoncurrent",
             // Leasing
             "FinanceLeaseLiabilityNoncurrent"
        ]
    },

  {
    codigo: "FLUJO_CAJA_OPERATIVO",
    categoria: "FLUJO_CAJA",
    tags: [
        // US-GAAP principal
        "NetCashProvidedByUsedInOperatingActivities",

        // Operaciones continuadas
        "NetCashProvidedByUsedInOperatingActivitiesContinuingOperations",

        // Alternativas históricas
        "CashFlowsFromOperatingActivities",
        "NetCashFlowFromOperatingActivities",

        // IFRS
        "ifrs-full:CashFlowsFromUsedInOperatingActivities",
        "ifrs-full:CashFlowsFromUsedInOperations"
    ]
},

    {
        codigo: "CAPEX",
        categoria: "FLUJO_CAJA",
        tags: [
            // Totales preferidos
            "PaymentsToAcquirePropertyPlantAndEquipment",
            "PaymentsForAdditionsToPropertyPlantAndEquipment",
            "PaymentsToAcquireProductiveAssets",

            // PP&E desglosado
            "PaymentsToAcquireOtherPropertyPlantAndEquipment",
            "PaymentsToAcquireMachineryAndEquipment",
            "PaymentsToAcquireBuildings",
            "PaymentsToAcquireFurnitureAndFixtures",
            "PaymentsToAcquireLandHeldForUse",

            // Sectoriales
            "PaymentsToDevelopRealEstateAssets",
            "PaymentsToAcquireCommercialRealEstate",
            "PaymentsToAcquireOilAndGasPropertyAndEquipment",
            "PaymentsToAcquireOilAndGasProperty",
            "PaymentsToAcquireOilAndGasEquipment",

            // Mejoras
            "PaymentsForCapitalImprovements",

            // IFRS
            "ifrs-full:PurchaseOfPropertyPlantAndEquipmentClassifiedAsInvestingActivities",
            "ifrs-full:PurchaseOfPropertyPlantAndEquipment"
        ]
    },

    {
    codigo: "DEPRECIACION_AMORTIZACION",
    categoria: "FLUJO_CAJA",
    tags: [
        // Agregados - máxima prioridad
        "DepreciationDepletionAndAmortization",
        "DepreciationAndAmortization",
        "DepreciationAmortizationAndAccretionNet",
        "DepreciationAmortizationAndOther",
        "DepreciationDepletionAndAmortizationPropertyPlantAndEquipment",

        // Componentes / fallbacks
        "Depreciation",
        "DepreciationExpense",
        "DepreciationPropertyPlantAndEquipment",
        "AmortizationOfIntangibleAssets",
        "AmortizationOfIntangibleAssetsAndDeferredCharges",
        "AmortizationOfDeferredCharges",
        "AmortizationExpense",

        // Sectoriales / específicos
        "Depletion",
        "DepletionExpense",
        "AccretionExpense",

        // IFRS
        "ifrs-full:DepreciationAndAmortisationExpense",
        "ifrs-full:DepreciationPropertyPlantAndEquipment",
        "ifrs-full:AmortisationIntangibleAssetsOtherThanGoodwill"
    ]
},
    {
        codigo: "INVENTARIOS",
        categoria: "BALANCE",
        tags: [
            // Totales - máxima prioridad
            "InventoryNet",
            "InventoryNetOfAllowancesCustomerAdvancesAndProgressBillings",
            "Inventory",
            "Inventories",
            "InventoryCurrent",

            // Retail / consumo
            "RetailRelatedInventory",
            "RetailRelatedInventoryMerchandise",

            // Utilities / energía
            "PublicUtilitiesInventory",
            "EnergyRelatedInventory",
            "InventoryCrudeOilProductsAndMerchandise",

            // Real estate
            "InventoryRealEstate",

            // Otros agregados
            "InventoryFinishedGoodsAndWorkInProcess",
            "InventoryNoncurrent",

            // Bruto
            "InventoryGross",

            // Componentes como último recurso
            "InventoryFinishedGoodsNetOfAllowancesCustomerAdvancesAndProgressBillings",
            "InventoryWorkInProcessNetOfAllowancesCustomerAdvancesAndProgressBillings",
            "InventoryRawMaterialsAndSuppliesNetOfAllowancesCustomerAdvancesAndProgressBillings",
            "InventoryFinishedGoods",
            "InventoryWorkInProcess",
            "InventoryRawMaterials",

            // IFRS
            "ifrs-full:Inventories",
            // Componentes adicionales
            "InventoryRawMaterialsAndSupplies",
            "InventoryRawMaterialsAndSuppliesNet",
            "InventoryFinishedGoodsNet",
            "InventoryWorkInProcessNet",
            "InventorySupplies",

            // Mercancías / retail
            "InventoryMerchandise",
            "MerchandiseInventory",

            // Energía / materias primas
            "InventoryNaturalGas",
            "InventoryPetroleumProducts",
            "InventoryMaterialsAndSupplies",

            // Otros
            "InventoryPartsAndComponents",
            "InventoryWorkInProcessAndRawMaterials",
            
            
        ]
    },

    {
        codigo: "CUENTAS_COBRAR",
        categoria: "BALANCE",
        tags: [
            "AccountsReceivableNetCurrent",
            "AccountsReceivableNet",

            "TradeAccountsReceivableNetCurrent",
            "TradeAccountsReceivableNet",
            "TradeReceivablesCurrent",

            "AccountsAndNotesReceivableNetCurrent",
            "NotesAndAccountsReceivableNetCurrent",
            "AccountsNotesAndLoansReceivableNetCurrent",

            "AccountsAndOtherReceivablesNetCurrent",
            "ReceivablesNetCurrent",

            "AccountsReceivableCurrent",
            "TradeAccountsReceivableCurrent",

            // Brutas como último recurso
            "AccountsReceivableGrossCurrent",

            // IFRS
            "ifrs-full:CurrentTradeReceivables",
            "ifrs-full:TradeAndOtherCurrentReceivables",
            // AÑADIR

            // Receivables agregados
            "ReceivablesCurrent",
            "ReceivablesNet",
            "TradeReceivablesNetCurrent",

            // Accounts + notes
            "AccountsAndNotesReceivableCurrent",
            "AccountsAndNotesReceivableNet",
            "NotesReceivableCurrent",
            "NotesReceivableNetCurrent",

            // Loans + receivables
            "LoansAndReceivablesCurrent",

            // Otros receivables
            "OtherReceivablesCurrent",
            "OtherReceivablesNetCurrent",

            // IFRS adicionales
            "ifrs-full:TradeReceivables",
            "ifrs-full:OtherCurrentReceivables",
            "ifrs-full:CurrentReceivables"
        ]
    },

    {
        codigo: "CUENTAS_PAGAR",
        categoria: "BALANCE",
        tags: [
            "AccountsPayableCurrent",

            "TradeAccountsPayableCurrent",
            "TradeAccountsPayable",
            "AccountsPayableTradeCurrent",

            "AccountsAndNotesPayableCurrent",
            "NotesAndAccountsPayableCurrent",

            "AccountsPayableCurrentAndNoncurrent",
            "AccountsPayableOtherCurrent",
            "AccountsPayableRelatedPartiesCurrent",

            "AccountsPayable",
            "AccountsPayableAndAccruedLiabilitiesCurrent",
            "AccountsPayableAndOtherAccruedLiabilities",

            // Último fallback
            "AccruedLiabilitiesCurrent",

            // IFRS
            "ifrs-full:CurrentTradePayables",
            "ifrs-full:TradeAndOtherCurrentPayables",
            //AÑADIR NUEVOS
            "TradePayablesCurrent",
            "TradePayables",
            "AccountsAndNotesPayable",
            "OtherAccountsPayableCurrent",
            "OtherPayablesCurrent",
            "PayablesCurrent",
            "ifrs-full:TradePayables",
            "ifrs-full:OtherCurrentPayables",
            "ifrs-full:CurrentPayables"
        ]
    },

    {
        codigo: "EPS_DILUIDO",
        categoria: "CUENTA_RESULTADOS",
        tags: [
            "EarningsPerShareDiluted",
            "ifrs-full:DilutedEarningsLossPerShare"
        ]
    }
];

// ============================================================================
// UTILIDADES - USA
// ============================================================================

function pcvDormir(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function pcvNormalizarTicker(valor: unknown): string {
    return String(valor || "").trim().toUpperCase();
}

function pcvNormalizarCIK(cik: number | string): string {
    return String(cik).replace(/\D/g, "").padStart(10, "0");
}

function pcvFecha(valor: unknown): string | null {
    if (!valor) return null;

    const s = String(valor).trim().slice(0, 10);

    return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

function pcvNumero(valor: unknown): number | null {
    const n = Number(valor);
    return Number.isFinite(n) ? n : null;
}

function pcvDiasEntre(inicio: string | null, fin: string | null): number | null {
    if (!inicio || !fin) return null;

    const a = new Date(`${inicio}T00:00:00Z`);
    const b = new Date(`${fin}T00:00:00Z`);
    const ms = b.getTime() - a.getTime();

    if (!Number.isFinite(ms) || ms < 0) return null;

    return Math.round(ms / 86400000);
}

// ============================================================================
// FETCH SEC - USA
// ============================================================================

async function pcvFetchSEC(url: string, intento = 0): Promise<any> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), PCV_SEC_TIMEOUT_MS);

    try {
        const response = await fetch(url, {
            headers: {
                "User-Agent": PCV_SEC_USER_AGENT,
                "Accept-Encoding": "gzip, deflate",
                "Accept": "application/json"
            },
            signal: controller.signal
        });

        clearTimeout(timeout);

        if (response.status === 429 && intento < PCV_SEC_MAX_RETRIES) {
            const espera = Math.min(2000 * Math.pow(2, intento), 30000);

            console.warn(`[PCV SEC] 429. Esperando ${espera} ms.`);

            await pcvDormir(espera);

            return pcvFetchSEC(url, intento + 1);
        }

        if (response.status >= 500 && intento < PCV_SEC_MAX_RETRIES) {
            const espera = Math.min(1000 * Math.pow(2, intento), 15000);

            await pcvDormir(espera);

            return pcvFetchSEC(url, intento + 1);
        }

        if (!response.ok) {
            const body = await response.text();

            throw new Error(`SEC HTTP ${response.status}: ${body.slice(0, 250)}`);
        }

        return await response.json();
    } catch (error) {
        clearTimeout(timeout);

        if (intento < PCV_SEC_MAX_RETRIES) {
            await pcvDormir(1000 * Math.pow(2, intento));

            return pcvFetchSEC(url, intento + 1);
        }

        throw error;
    }
}

// ============================================================================
// TICKER -> CIK - USA
// ============================================================================

async function pcvDescargarMapaCIK(): Promise<Map<string, string>> {
    console.log("[PCV SEC] Descargando mapa ticker -> CIK...");

    const json = await pcvFetchSEC("https://www.sec.gov/files/company_tickers.json");

    const mapa = new Map<string, string>();

    for (const fila of Object.values(json) as PCVEmpresaSEC[]) {
        const ticker = pcvNormalizarTicker(fila.ticker);

        if (!ticker) continue;

        mapa.set(ticker, pcvNormalizarCIK(fila.cik_str));
    }

    console.log(`[PCV SEC] Tickers mapeados: ${mapa.size}`);

    return mapa;
}

// ============================================================================
// TAXONOMIA - USA
// ============================================================================

async function pcvPrepararTaxonomia(): Promise<Map<string, number>> {
    const db = conexion as any;

    console.log("[PCV] Preparando TAXONOMIA_CONCEPTO...");

    for (const concepto of PCV_CONCEPTOS) {
        await db.query(
            `
            INSERT INTO taxonomia_concepto (concepto_estandar, categoria)
            VALUES (?, ?)
            ON DUPLICATE KEY UPDATE categoria = VALUES(categoria)
            `,
            [concepto.codigo, concepto.categoria]
        );
    }

    const [rows]: any = await db.query(
        `
        SELECT id, concepto_estandar
        FROM taxonomia_concepto
        WHERE concepto_estandar IN (?)
        `,
        [PCV_CONCEPTOS.map(c => c.codigo)]
    );

    const mapa = new Map<string, number>();

    for (const row of rows) {
        mapa.set(String(row.concepto_estandar), Number(row.id));
    }

    console.log(`[PCV] Conceptos estandar disponibles: ${mapa.size}/${PCV_CONCEPTOS.length}`);

    return mapa;
}

// ============================================================================
// INFORMES USA DESDE BD
// ============================================================================

async function pcvCargarInformesUSA(): Promise<PCVInformeUSA[]> {
    const db = conexion as any;

    const [rows]: any = await db.query(
        `
        SELECT DISTINCT
            inf.id AS informe_id,
            inf.empresa_id,
            inf.tipo_periodo,
            inf.tipo_documento,
            inf.fecha_fin_periodo,
            inf.fecha_publicacion,
            inf.identificador_fuente AS accession,
            i.ticker
        FROM informe_financiero inf
        INNER JOIN instrumento i
            ON i.empresa_id = inf.empresa_id
        INNER JOIN mercado m
            ON m.id = i.mercado_id
        WHERE inf.fuente = 'SEC_EDGAR'
          AND inf.identificador_fuente IS NOT NULL
          AND TRIM(inf.identificador_fuente) <> ''
          AND UPPER(m.nombre_bolsa) IN (
              'NASDAQ STOCK MARKET',
              'NEW YORK STOCK EXCHANGE',
              'NYSE AMERICAN'
          )
          AND i.ticker IS NOT NULL
          AND TRIM(i.ticker) <> ''
        ORDER BY inf.empresa_id, inf.id
        `
    );

    const mapa = new Map<number, PCVInformeUSA>();

    for (const row of rows) {
        const informeId = Number(row.informe_id);

        if (!informeId || mapa.has(informeId)) {
            continue;
        }

        mapa.set(informeId, {
            informe_id: informeId,
            empresa_id: Number(row.empresa_id),
            ticker: pcvNormalizarTicker(row.ticker),
            tipo_periodo: String(row.tipo_periodo || ""),
            tipo_documento: String(row.tipo_documento || ""),
            fecha_fin_periodo: pcvFecha(row.fecha_fin_periodo),
            fecha_publicacion: pcvFecha(row.fecha_publicacion),
            accession: String(row.accession || "").trim()
        });
    }

    const informes = Array.from(mapa.values());

    console.log(`[PCV USA] Informes SEC cargados desde BD: ${informes.length}`);

    return informes;
}

function pcvAgruparPorEmpresa(informes: PCVInformeUSA[]): Map<number, PCVInformeUSA[]> {
    const mapa = new Map<number, PCVInformeUSA[]>();

    for (const informe of informes) {
        const lista = mapa.get(informe.empresa_id) || [];

        lista.push(informe);

        mapa.set(informe.empresa_id, lista);
    }

    return mapa;
}

// ============================================================================
// COMPANYFACTS - USA
// ============================================================================

async function pcvDescargarCompanyFacts(cik: string): Promise<any> {
    const url = `https://data.sec.gov/api/xbrl/companyfacts/CIK${cik}.json`;

    return await pcvFetchSEC(url);
}

// ============================================================================
// CANDIDATOS DE UN TAG PARA UN INFORME - USA
// ============================================================================

function pcvCandidatosTag(
    companyFacts: any,
    tag: string,
    informe: PCVInformeUSA
): PCVCandidatoFact[] {
    // Por defecto los tags pertenecen a us-gaap.
    // Si el tag viene como "namespace:Tag", usar ese namespace.
    // Esto es necesario, por ejemplo, para:
    // dei:EntityCommonStockSharesOutstanding.
    const separador = tag.indexOf(":");
    const namespace =
        separador >= 0
            ? tag.slice(0, separador)
            : "us-gaap";
    const tagLocal =
        separador >= 0
            ? tag.slice(separador + 1)
            : tag;

    const concepto =
        companyFacts?.facts?.[namespace]?.[tagLocal];

    if (!concepto) {
        return [];
    }

    const units = concepto?.units;

    if (!units || typeof units !== "object") {
        return [];
    }

    const candidatos: PCVCandidatoFact[] = [];

    for (const [unit, filas] of Object.entries(units)) {
        if (!Array.isArray(filas)) continue;

        for (const fila of filas as any[]) {
            const accn = String(fila?.accn || "").trim();

            if (accn !== informe.accession) continue;

            const value = pcvNumero(fila?.val);

            if (value === null) continue;

            const form = String(fila?.form || "").trim().toUpperCase();

            if (
                informe.tipo_documento &&
                form &&
                form !== informe.tipo_documento.trim().toUpperCase()
            ) {
                continue;
            }

            candidatos.push({
                tag,
                value,
                start: pcvFecha(fila?.start),
                end: pcvFecha(fila?.end),
                filed: pcvFecha(fila?.filed),
                form: form || null,
                accn: accn || null,
                unit: String(unit)
            });
        }
    }

    return candidatos;
}

// ============================================================================
// ELEGIR EL FACT CORRECTO - USA
//
// - BALANCE: prioriza facts instantaneos y end == fecha_fin_periodo.
// - TRIMESTRAL: prioriza duracion ~91 dias.
// - ANUAL: prioriza duracion ~365 dias.
// - accessionNumber debe coincidir exactamente.
// ============================================================================

function pcvElegirMejorFact(
    candidatos: PCVCandidatoFact[],
    informe: PCVInformeUSA,
    categoria: string
): PCVCandidatoFact | null {
    if (candidatos.length === 0) {
        return null;
    }

    let mejor: PCVCandidatoFact | null = null;
    let mejorScore = -Infinity;

    for (const c of candidatos) {
        let score = 0;

        if (informe.fecha_fin_periodo && c.end === informe.fecha_fin_periodo) {
            score += 100;
        }

        if (informe.fecha_publicacion && c.filed === informe.fecha_publicacion) {
            score += 20;
        }

        const duracion = pcvDiasEntre(c.start, c.end);

        if (categoria === "BALANCE") {
            if (!c.start) {
                score += 60;
            }
        } else if (informe.tipo_periodo.toUpperCase() === "TRIMESTRAL") {
            if (duracion !== null) {
                const desviacion = Math.abs(duracion - 91);

                score += Math.max(0, 60 - desviacion);
            }
        } else if (informe.tipo_periodo.toUpperCase() === "ANUAL") {
            if (duracion !== null) {
                const desviacion = Math.abs(duracion - 365);

                score += Math.max(0, 60 - Math.floor(desviacion / 2));
            }
        }

        if (c.unit === "USD") {
            score += 10;
        }

        if (c.unit.toLowerCase().includes("usd")) {
            score += 5;
        }

        if (score > mejorScore) {
            mejorScore = score;
            mejor = c;
        }
    }

    return mejor;
}

// ============================================================================
// EXTRAER PARTIDAS NORMALIZADAS DE UN INFORME - USA
// ============================================================================

function pcvExtraerPartidasInforme(
    companyFacts: any,
    informe: PCVInformeUSA,
    taxonomiaIds: Map<string, number>
): PCVPartidaPreparada[] {
    const resultado: PCVPartidaPreparada[] = [];

    for (const definicion of PCV_CONCEPTOS) {
        const conceptoId = taxonomiaIds.get(definicion.codigo);

        if (!conceptoId) continue;

        let elegido: PCVCandidatoFact | null = null;
        let indiceTagElegido = -1;

        for (let i = 0; i < definicion.tags.length; i++) {
            const tag = definicion.tags[i];

            const candidatos = pcvCandidatosTag(companyFacts, tag, informe);
            const mejor = pcvElegirMejorFact(candidatos, informe, definicion.categoria);

            if (mejor) {
                elegido = mejor;
                indiceTagElegido = i;
                break;
            }
        }

        if (!elegido) continue;

        resultado.push({
            informeId: informe.informe_id,
            conceptoEstandarId: conceptoId,
            conceptoOriginal: elegido.tag,
            importe: elegido.value,
            nivelConfianza: indiceTagElegido === 0 ? "ALTA" : "MEDIA"
        });
    }

    return resultado;
}

// ============================================================================
// GUARDAR PARTIDAS - USA
// ============================================================================

async function pcvGuardarPartidas(partidas: PCVPartidaPreparada[]): Promise<number> {
    if (partidas.length === 0) {
        return 0;
    }

    const db = conexion as any;
    const mapa = new Map<string, PCVPartidaPreparada>();

    for (const p of partidas) {
        mapa.set(`${p.informeId}|${p.conceptoEstandarId}`, p);
    }

    const valores = Array.from(mapa.values()).map(p => [
        p.informeId,
        p.conceptoEstandarId,
        p.conceptoOriginal,
        p.importe,
        p.nivelConfianza
    ]);

    const TAMANO_LOTE = 1000;
    let total = 0;

    for (let i = 0; i < valores.length; i += TAMANO_LOTE) {
        const lote = valores.slice(i, i + TAMANO_LOTE);

        const [resultado]: any = await db.query(
            `
            INSERT INTO partida_contable_valor (
                informe_id,
                concepto_estandar_id,
                concepto,
                importe,
                nivel_confianza
            )
            VALUES ?
            ON DUPLICATE KEY UPDATE
                concepto = VALUES(concepto),
                importe = VALUES(importe),
                nivel_confianza = VALUES(nivel_confianza)
            `,
            [lote]
        );

        total += Number(resultado?.affectedRows || lote.length);
    }

    return total;
}

// ============================================================================
// MOTOR PRINCIPAL - USA
// ============================================================================

export async function ejecutarCargaPartidasContablesUSA() {
    const inicio = Date.now();

    console.log("\n======================================================");
    console.log(" PARTIDA_CONTABLE_VALOR - USA / SEC COMPANYFACTS");
    console.log("======================================================");

    const taxonomiaIds = await pcvPrepararTaxonomia();

    if (taxonomiaIds.size === 0) {
        throw new Error("No se pudo cargar TAXONOMIA_CONCEPTO.");
    }

    const informes = await pcvCargarInformesUSA();

    if (informes.length === 0) {
        throw new Error("No existen INFORME_FINANCIERO SEC_EDGAR para procesar.");
    }

    const informesPorEmpresa = pcvAgruparPorEmpresa(informes);

    console.log(`[PCV USA] Empresas con informes: ${informesPorEmpresa.size}`);

    const mapaCIK = await pcvDescargarMapaCIK();

    let empresasProcesadas = 0;
    let empresasSinCIK = 0;
    let empresasError = 0;
    let informesProcesados = 0;
    let informesSinPartidas = 0;
    let partidasDetectadas = 0;
    let operacionesBD = 0;

    for (const [empresaId, informesEmpresa] of informesPorEmpresa.entries()) {
        const ticker = informesEmpresa[0]?.ticker;
        const cik = mapaCIK.get(ticker);

        if (!cik) {
            empresasSinCIK++;

            console.warn(`[PCV USA] Sin CIK: ${ticker} empresa_id=${empresaId}`);

            continue;
        }

        try {
            // UNA sola llamada CompanyFacts por empresa.
            const companyFacts = await pcvDescargarCompanyFacts(cik);

            const partidasEmpresa: PCVPartidaPreparada[] = [];

            for (const informe of informesEmpresa) {
                const partidas = pcvExtraerPartidasInforme(companyFacts, informe, taxonomiaIds);

                informesProcesados++;

                if (partidas.length === 0) {
                    informesSinPartidas++;
                    continue;
                }

                partidasDetectadas += partidas.length;

                partidasEmpresa.push(...partidas);
            }

            if (partidasEmpresa.length > 0) {
                operacionesBD += await pcvGuardarPartidas(partidasEmpresa);
            }

            empresasProcesadas++;

            if (empresasProcesadas % 100 === 0) {
                console.log(
                    `[PCV USA] Empresas ${empresasProcesadas}/${informesPorEmpresa.size} | ` +
                    `informes: ${informesProcesados} | ` +
                    `partidas: ${partidasDetectadas} | ` +
                    `informes sin partidas: ${informesSinPartidas}`
                );
            }
        } catch (error) {
            empresasError++;

            console.error(
                `[PCV USA] Error ${ticker} (CIK ${cik}):`,
                error instanceof Error ? error.message : String(error)
            );
        }

        await pcvDormir(PCV_SEC_INTERVALO_MS);
    }

    const duracionMs = Date.now() - inicio;

    console.log("\n[PCV USA] RESUMEN FINAL");
    console.log(`- Empresas con informes: ${informesPorEmpresa.size}`);
    console.log(`- Empresas procesadas: ${empresasProcesadas}`);
    console.log(`- Empresas sin CIK: ${empresasSinCIK}`);
    console.log(`- Empresas con error: ${empresasError}`);
    console.log(`- Informes procesados: ${informesProcesados}`);
    console.log(`- Informes sin partidas mapeadas: ${informesSinPartidas}`);
    console.log(`- Partidas detectadas: ${partidasDetectadas}`);
    console.log(`- Operaciones BD: ${operacionesBD}`);
    console.log(`- Tiempo total: ${(duracionMs / 1000).toFixed(1)} s`);

    return {
        empresas: informesPorEmpresa.size,
        empresasProcesadas,
        empresasSinCIK,
        empresasError,
        informesProcesados,
        informesSinPartidas,
        partidasDetectadas,
        operacionesBD,
        duracionMs
    };
}

// ============================================================================
// ENDPOINT EXPRESS - USA
// POST /api/partida-contable-valor/usa/actualizar
// ============================================================================

export async function actualizarPartidasContablesUSA(
    _req: Request,
    res: Response
): Promise<void> {
    try {
        const resultado = await ejecutarCargaPartidasContablesUSA();

        res.status(200).json({
            ok: true,
            mensaje: "Carga de PARTIDA_CONTABLE_VALOR USA finalizada.",
            resumen: resultado
        });
    } catch (error) {
        console.error("[PCV USA] ERROR CRITICO:", error);

        res.status(500).json({
            ok: false,
            mensaje: "No se pudo cargar PARTIDA_CONTABLE_VALOR USA.",
            error: error instanceof Error ? error.message : String(error)
        });
    }
}

// ============================================================================
// EJECUCION DIRECTA - USA (comentado)
//
// Para probar manualmente: npx ts-node insercionPartidaContableValor.ts
// Si hay otros paises en el mismo archivo, dejar activa solo esta llamada
// durante la prueba.
// ============================================================================

 //ejecutarCargaPartidasContablesUSA()
 //    .then(resultado => {
 //        console.log("\n=== PARTIDA_CONTABLE_VALOR USA FINALIZADA ===");
 //        console.log(resultado);
//     })
 //    .catch(error => {
 //        console.error("\n=== ERROR CRITICO PARTIDA_CONTABLE_VALOR USA ===", error);
 //        process.exitCode = 1;
 //    });

// ============================================================================
// TAXONOMIA - TAIWAN
// ============================================================================

const TWOPT_CONCEPTOS: TWOPTConcepto[] = [
    {
        codigo: "INGRESOS",
        categoria: "CUENTA_RESULTADOS",
        datasets: ["TaiwanStockFinancialStatements"],
        aliases: [
            "Revenue",
            "Revenues",
            "OperatingRevenue",
            "NetSales",
            "SalesRevenue",
            "SalesRevenueNet"
        ]
    },
    {
        codigo: "BENEFICIO_BRUTO",
        categoria: "CUENTA_RESULTADOS",
        datasets: ["TaiwanStockFinancialStatements"],
        aliases: [
            "GrossProfit",
            "GrossProfitLoss"
        ]
    },
    {
        codigo: "EBIT",
        categoria: "CUENTA_RESULTADOS",
        datasets: ["TaiwanStockFinancialStatements"],
        aliases: [
            "OperatingIncome",
            "OperatingIncomeLoss",
            "OperatingProfit",
            "OperatingProfitLoss"
        ]
    },
    {
        codigo: "BENEFICIO_NETO",
        categoria: "CUENTA_RESULTADOS",
        datasets: ["TaiwanStockFinancialStatements"],
        aliases: [
            "NetIncome",
            "NetIncomeLoss",
            "ProfitLoss",
            "ProfitAttributableToOwnersOfParent",
            "IncomeAfterTaxes",
            "TotalConsolidatedProfitForThePeriod"
        ]
    },

    {
        codigo: "BENEFICIO_ANTES_IMPUESTOS",
        categoria: "CUENTA_RESULTADOS",
        datasets: ["TaiwanStockCashFlowsStatement"],
        aliases: [
            "NetIncomeBeforeTax"
        ]
    },

    {
        codigo: "IMPUESTO_BENEFICIOS",
        categoria: "CUENTA_RESULTADOS",
        datasets: ["TaiwanStockFinancialStatements"],
        aliases: [
            "IncomeTaxExpense",
            "IncomeTaxExpenseBenefit",
            "TaxExpense"
        ]
    },

    // ============================================================
    // DIVIDENDOS
    // ============================================================
    // Mantenemos Cash Flow como fuente del pago real.
    // TaiwanStockDividend se utiliza además como fuente específica
    // para reconstruir dividendos cuando el CF no proporciona
    // directamente el importe.
    //
    // En TaiwanStockDividend:
    //
    // CashEarningsDistribution
    // CashStatutorySurplus
    // ParticipateDistributionOfTotalShares
    //
    // están documentados oficialmente por FinMind.
    //
    // La reconstrucción debe hacerse fuera del matcher type/value:
    //
    // dividendos =
    // (CashEarningsDistribution + CashStatutorySurplus)
    // * ParticipateDistributionOfTotalShares
    //
    {
        codigo: "DIVIDENDOS_PAGADOS",
        categoria: "FLUJO_CAJA",
        datasets: [
            "TaiwanStockCashFlowsStatement",
            "TaiwanStockDividend"
        ],
        aliases: [
            // EXISTENTES
            "CashDividendsPaid",
            "DividendsPaid",
            "DividendsPaidClassifiedAsFinancingActivities",
            "DividendsPaidToOwnersOfParent",
            "DividendsPaidToEquityHoldersOfParent",
            "CashDividendsPaidToOwnersOfParent",
            "PaymentsOfDividends",
            "PaymentOfDividends",
            "CashDistributionToOwners",
            "DistributionOfCashDividends",

            // CAMPOS FINMIND DOCUMENTADOS
            "CashEarningsDistribution",
            "CashStatutorySurplus",
            "ParticipateDistributionOfTotalShares"
        ]
    },

    // ============================================================
    // GASTO DE INTERESES
    // ============================================================
    // Se amplía la búsqueda también al Cash Flow.
    //
    {
        codigo: "GASTO_INTERESES",
        categoria: "CUENTA_RESULTADOS",
        datasets: [
            "TaiwanStockFinancialStatements",
            "TaiwanStockCashFlowsStatement"
        ],
        aliases: [
            // EXISTENTES
            "InterestExpense",
            "InterestExpenses",
            "FinanceCosts",
            "FinanceCost",

            // AMPLIACIÓN
            "InterestPaid",
            "InterestExpenseNonOperating",
            "InterestCosts",
            "InterestCost",
            "FinanceExpense",
            "FinanceExpenses",
            "FinancialCost",
            "FinancialCosts",
            "InterestAndFinanceCosts",
            "InterestAndFinanceExpenses"
        ]
    },

    {
        codigo: "EFECTIVO",
        categoria: "BALANCE",
        datasets: ["TaiwanStockBalanceSheet"],
        aliases: [
            "CashAndCashEquivalents",
            "CashAndCashEquivalentsAtCarryingValue",
            "CashAndDeposits"
        ]
    },

    {
        codigo: "ACTIVOS_TOTALES",
        categoria: "BALANCE",
        datasets: ["TaiwanStockBalanceSheet"],
        aliases: [
            "Assets",
            "TotalAssets"
        ]
    },

    {
        codigo: "PASIVOS_TOTALES",
        categoria: "BALANCE",
        datasets: ["TaiwanStockBalanceSheet"],
        aliases: [
            "Liabilities",
            "TotalLiabilities"
        ]
    },

    {
        codigo: "PATRIMONIO_NETO",
        categoria: "BALANCE",
        datasets: ["TaiwanStockBalanceSheet"],
        aliases: [
            "Equity",
            "TotalEquity",
            "StockholdersEquity",
            "NetAssets",
            "EquityAttributableToOwnersOfParent"
        ]
    },

    // ============================================================
    // DEUDA CORTO PLAZO
    // ============================================================
    {
        codigo: "DEUDA_CORTO_PLAZO",
        categoria: "BALANCE",
        datasets: ["TaiwanStockBalanceSheet"],
        aliases: [
            // EXISTENTES
            "ShortTermBorrowings",
            "ShortTermLoans",
            "DebtCurrent",
            "CurrentBorrowings",
            "CurrentPortionOfLongTermDebt",

            // AMPLIACIÓN
            "BorrowingsCurrent",
            "ShortTermDebt",
            "CurrentDebt",
            "ShortTermBankLoans",
            "BankLoansCurrent",
            "LoansPayableCurrent",
            "NotesPayableCurrent",
            "ShortTermNotesPayable",

            "BondsPayableCurrent",
            "CurrentPortionOfBondsPayable",

            "CurrentPortionOfLongTermBorrowings",
            "CurrentPortionOfLongTermLoans",
            "CurrentPortionOfLongTermDebtAndBorrowings",

            "FinancialLiabilitiesCurrent",

            "LeaseLiabilitiesCurrent",
            "CurrentLeaseLiabilities",

            "FinanceLeaseLiabilitiesCurrent",
            "FinanceLeaseLiabilityCurrent"
        ]
    },

    // ============================================================
    // DEUDA LARGO PLAZO
    // ============================================================
    {
        codigo: "DEUDA_LARGO_PLAZO",
        categoria: "BALANCE",
        datasets: ["TaiwanStockBalanceSheet"],
        aliases: [
            // EXISTENTES
            "LongTermDebtNoncurrent",
            "LongTermDebt",
            "NonCurrentBorrowings",
            "BorrowingsNonCurrent",
            "LongTermBorrowings",
            "LongTermLoans",
            "LongTermLoansPayable",
            "BondsPayable",
            "Bonds",
            "FinancialLiabilitiesNonCurrent",
            "LeaseLiabilitiesNonCurrent",
            "LeaseLiabilities",

            // AMPLIACIÓN
            "DebtNonCurrent",
            "DebtNoncurrent",
            "NonCurrentDebt",
            "NoncurrentDebt",

            "BorrowingsNoncurrent",
            "NoncurrentBorrowings",

            "LongTermBankLoans",
            "BankLoansNonCurrent",
            "BankLoansNoncurrent",

            "LoansPayableNonCurrent",
            "LoansPayableNoncurrent",

            "NotesPayableNonCurrent",
            "NotesPayableNoncurrent",
            "LongTermNotesPayable",

            "BondsPayableNonCurrent",
            "BondsPayableNoncurrent",
            "LongTermBondsPayable",

            "NonCurrentFinancialLiabilities",
            "NoncurrentFinancialLiabilities",

            "FinanceLeaseLiabilitiesNonCurrent",
            "FinanceLeaseLiabilitiesNoncurrent",
            "FinanceLeaseLiabilityNonCurrent",
            "FinanceLeaseLiabilityNoncurrent",

            "NonCurrentLeaseLiabilities",
            "NoncurrentLeaseLiabilities"
        ]
    },

    {
        codigo: "FLUJO_CAJA_OPERATIVO",
        categoria: "FLUJO_CAJA",
        datasets: ["TaiwanStockCashFlowsStatement"],
        aliases: [
            "CashFlowsFromOperatingActivities",
            "NetCashProvidedByUsedInOperatingActivities",
            "CashFlowsFromUsedInOperatingActivities",
            "NetCashFromOperatingActivities"
        ]
    },

    {
        codigo: "CAPEX",
        categoria: "FLUJO_CAJA",
        datasets: ["TaiwanStockCashFlowsStatement"],
        aliases: [
            "PropertyAndPlantAndEquipment",
            "PaymentsToAcquirePropertyPlantAndEquipment",
            "PurchaseOfPropertyPlantAndEquipment",
            "AcquisitionOfPropertyPlantAndEquipment"
        ]
    },

    {
        codigo: "DEPRECIACION_AMORTIZACION",
        categoria: "FLUJO_CAJA",
        datasets: ["TaiwanStockCashFlowsStatement"],
        aliases: [
            "DepreciationAndAmortization",
            "Depreciation",
            "DepreciationDepletionAndAmortization",
            "AmortizationExpense"
        ]
    },

    {
        codigo: "INVENTARIOS",
        categoria: "BALANCE",
        datasets: ["TaiwanStockBalanceSheet"],
        aliases: [
            "Inventory",
            "InventoryNet",
            "Inventories"
        ]
    },

    {
        codigo: "CUENTAS_COBRAR",
        categoria: "BALANCE",
        datasets: ["TaiwanStockBalanceSheet"],
        aliases: [
            "AccountsReceivableNetCurrent",
            "AccountsReceivableNet",
            "AccountsReceivable",

            "TradeReceivables",
            "TradeReceivablesCurrent",
            "TradeAndOtherReceivables",
            "TradeAndOtherReceivablesCurrent",

            "NotesAndAccountsReceivable",
            "NotesAndAccountsReceivableCurrent"
        ]
    },

    {
        codigo: "CUENTAS_PAGAR",
        categoria: "BALANCE",
        datasets: ["TaiwanStockBalanceSheet"],
        aliases: [
            "AccountsPayableCurrent",
            "AccountsPayable",
            "TradePayablesCurrent",
            "TradePayables",

            "TradeAndOtherPayablesCurrent",
            "TradeAndOtherPayables",

            "NotesAndAccountsPayableCurrent",
            "NotesAndAccountsPayable"
        ]
    },

    {
        codigo: "EPS_DILUIDO",
        categoria: "CUENTA_RESULTADOS",
        datasets: ["TaiwanStockFinancialStatements"],
        aliases: [
            "DilutedEarningsPerShare",
            "EarningsPerShareDiluted",
            "DilutedEPS",
            "EPS"
        ]
    },

    // ============================================================
    // ACCIONES EN CIRCULACIÓN
    // ============================================================
    //
    // FUENTE PRINCIPAL:
    // TaiwanStockShareholding.NumberOfSharesIssued
    //
    // FinMind documenta explícitamente este campo y dispone
    // de histórico desde 2004-02-01.
    //
    // FALLBACK:
    // TaiwanStockDividend.ParticipateDistributionOfTotalShares
    //
    // OJO:
    // ambos son campos propios de sus datasets y no simples
    // registros type/value. El motor debe tratarlos expresamente.
    //
    {
        codigo: "ACCIONES_EN_CIRCULACION",
        categoria: "BALANCE",
        datasets: [
            "TaiwanStockShareholding",
            "TaiwanStockDividend"
        ],
        aliases: [
            "NumberOfSharesIssued",
            "ParticipateDistributionOfTotalShares"
        ]
    }
];
// ============================================================================
// UTILIDADES - TAIWAN
// ============================================================================

function twOptSleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function twOptTicker(v: unknown): string {
    return String(v || "").trim().toUpperCase().replace(/\.TW$/i, "").replace(/\.TWO$/i, "");
}

function twOptFecha(v: unknown): string | null {
    if (!v) {
        return null;
    }

    // Si MySQL devuelve un objeto Date, conservar la fecha de calendario local.
    // NO usar toISOString(): puede desplazar el día por la zona horaria.
    if (v instanceof Date) {
        if (isNaN(v.getTime())) {
            return null;
        }

        const yyyy = v.getFullYear();
        const mm = String(v.getMonth() + 1).padStart(2, "0");
        const dd = String(v.getDate()).padStart(2, "0");

        return `${yyyy}-${mm}-${dd}`;
    }

    // Si viene como string
    const texto = String(v).trim();

    // YYYY-MM-DD
    const match = texto.match(/^(\d{4}-\d{2}-\d{2})/);

    if (match) {
        return match[1];
    }

    // Último intento: convertir a Date
    const fecha = new Date(texto);

    if (!isNaN(fecha.getTime())) {

        return fecha
            .toISOString()
            .slice(0, 10);
    }

    return null;
}

function twOptNumero(v: unknown): number | null {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
}

function twOptTexto(v: unknown): string {
    return String(v || "").trim().toLowerCase().replace(/[\s_\-.:/\\()]/g, "");
}

function twOptStartDate(): string {
    const d = new Date();
    d.setUTCFullYear(d.getUTCFullYear() - TWOPT_YEARS);
    return d.toISOString().slice(0, 10);
}

async function twOptFetch(url: string): Promise<any> {
    const tokenState = await twOptReservarToken();

    const headers = {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${tokenState.token}`
    };

    const controller = new AbortController();
    const timeout = setTimeout(
        () => controller.abort(),
        TWOPT_TIMEOUT_MS
    );

    try {
        const response = await fetch(url, {
            method: "GET",
            headers,
            signal: controller.signal
        });

        tokenState.requests++;


        // ============================================================
        // 402 = CUOTA TOTAL DEL TOKEN AGOTADA
        // Se desactiva este token y se prueba la misma petición
        // automáticamente con otro token disponible.
        // ============================================================

        if (response.status === 402) {

            tokenState.quotaExhausted = true;
            tokenState.errores++;

            console.warn(
                `[TWOPT] Token ${tokenState.id} agotado (HTTP 402). ` +
                `Se desactiva para esta ejecución.`
            );

            const quedanTokens = TWOPT_TOKEN_STATES.some(
                t => !t.quotaExhausted
            );

            if (quedanTokens) {
                return twOptFetch(url);
            }

            throw new Error(
                "FINMIND_QUOTA_EXHAUSTED: todos los tokens FinMind han agotado su cuota."
            );
        }


        // ============================================================
        // 429 = RATE LIMIT TEMPORAL
        // NO significa que la cuota esté agotada.
        // Ponemos el token en cooldown durante 60 segundos.
        // ============================================================

        if (response.status === 429) {

            tokenState.errores++;

            tokenState.cooldownUntil = Math.max(
                tokenState.cooldownUntil,
                Date.now() + 60000
            );

            tokenState.rateLimits++;

            console.warn(
                `[TWOPT] Token ${tokenState.id} rate limit (HTTP 429). ` +
                `Cooldown 60 segundos.`
            );

            // Intentar la misma petición con otro token disponible.
            return twOptFetch(url);
        }


        // ============================================================
        // RESTO DE ERRORES HTTP
        // ============================================================

        if (!response.ok) {

            const cuerpo = await response.text().catch(() => "");

            console.error(
                `\n[TWOPT ERROR REAL]` +
                `\nToken: ${tokenState.id}` +
                `\nHTTP: ${response.status} ${response.statusText}` +
                `\nURL: ${url}` +
                `\nRespuesta FinMind: ${cuerpo.slice(0, 1000)}\n`
            );

            tokenState.errores++;

            throw new Error(
                `FinMind HTTP ${response.status}: ${cuerpo.slice(0, 300)}`
            );
        }


        // ============================================================
        // RESPUESTA CORRECTA
        // ============================================================

        return await response.json();


    } catch (error) {

        // ============================================================
        // TIMEOUT
        // ============================================================

        if (
            error instanceof Error &&
            error.name === "AbortError"
        ) {
            tokenState.errores++;

            throw new Error(
                `FinMind timeout (${TWOPT_TIMEOUT_MS}ms) para ${url}`
            );
        }

        throw error;

    } finally {

        clearTimeout(timeout);
    }
}


// ============================================================================
// FINMIND MULTI-TOKEN + RATE LIMITER - TAIWAN
//
// Mantiene el ritmo configurado en TWOPT_RPM POR TOKEN.


const TWOPT_WORKERS = Math.max(
    1,
    Number(process.env.FINMIND_PCV_WORKERS || "8")
);

interface TWOPTTokenState {
    id: number;
    token: string;
    nextAllowedAt: number;
    cooldownUntil: number;
    requests: number;
    rateLimits: number;
    errores: number;
    quotaExhausted: boolean;
}

function twOptCrearTokenStates(): TWOPTTokenState[] {

    return TWOPT_FINMIND_TOKENS.map(
        (token, index) => ({
            id: index + 1,
            token,
            nextAllowedAt: 0,
            cooldownUntil: 0,
            requests: 0,
            rateLimits: 0,
            errores: 0,
            quotaExhausted: false
        })
    );
}

let TWOPT_TOKEN_STATES: TWOPTTokenState[] = [];

async function twOptReservarToken(): Promise<TWOPTTokenState> {
    if (TWOPT_TOKEN_STATES.length === 0) {
        throw new Error(
            "No hay tokens FinMind configurados. Configura TWOPT_FINMIND_TOKEN y/o FINMIND_TOKEN_2."
        );
    }

    const intervalo = Math.ceil(60000 / Math.max(1, TWOPT_RPM));

    while (true) {
        const ahora = Date.now();

        let elegido = TWOPT_TOKEN_STATES[0];
        let mejorMomento = Math.max(
            elegido.nextAllowedAt,
            elegido.cooldownUntil
        );

        for (const estado of TWOPT_TOKEN_STATES.slice(1)) {
            const momento = Math.max(
                estado.nextAllowedAt,
                estado.cooldownUntil
            );

            if (momento < mejorMomento) {
                elegido = estado;
                mejorMomento = momento;
            }
        }

        // Reservamos el siguiente hueco ANTES del await.
        // Así varios workers no pueden coger el mismo slot simultáneamente.
        const salida = Math.max(ahora, mejorMomento);
        elegido.nextAllowedAt = salida + intervalo;

        const espera = salida - ahora;

        if (espera > 0) {
            await twOptSleep(espera);
        }

        return elegido;
    }
}

function twOptPonerCooldown(
    estado: TWOPTTokenState,
    intento: number
): number {
    const espera = Math.min(
        15000 * Math.pow(2, intento),
        120000
    );

    estado.cooldownUntil = Math.max(
        estado.cooldownUntil,
        Date.now() + espera
    );

    estado.rateLimits++;

    return espera;
}

// ============================================================================
// FETCH FINMIND - TAIWAN
// ============================================================================

// ============================================================================
// TAXONOMIA - TAIWAN
// ============================================================================

async function twOptPrepararTaxonomia(): Promise<Map<string, number>> {
    const db = conexion as any;

    // Conceptos extra que no pertenecen al esquema normal type/value
    // de TWOPT_CONCEPTOS.
    const conceptosExtra = [
        {
            codigo: "ACCIONES_EN_CIRCULACION",
            categoria: "BALANCE"
        }
    ];

    const conceptosTaxonomia = [
        ...TWOPT_CONCEPTOS.map(c => ({
            codigo: c.codigo,
            categoria: c.categoria
        })),
        ...conceptosExtra
    ];

    // Evitar duplicados
    const unicos = Array.from(
        new Map(
            conceptosTaxonomia.map(c => [c.codigo, c])
        ).values()
    );

    for (const c of unicos) {
        await db.query(
            `
            INSERT INTO taxonomia_concepto (
                concepto_estandar,
                categoria
            )
            VALUES (?, ?)
            ON DUPLICATE KEY UPDATE
                categoria = VALUES(categoria)
            `,
            [c.codigo, c.categoria]
        );
    }

    const codigos = unicos.map(c => c.codigo);

    const [rows]: any = await db.query(
        `
        SELECT
            id,
            concepto_estandar
        FROM taxonomia_concepto
        WHERE concepto_estandar IN (?)
        `,
        [codigos]
    );

    const mapa = new Map<string, number>();

    for (const r of rows) {
        mapa.set(
            String(r.concepto_estandar),
            Number(r.id)
        );
    }

    console.log(
        "[TWOPT] Taxonomia: ${mapa.size}/${codigos.length}"
    );

    return mapa;
}



// ============================================================================
// CARGAR INFORMES PENDIENTES - TAIWAN
// ============================================================================

async function twOptCargarInformesPendientes(): Promise<TWOPTInforme[]> {
    const db = conexion as any;

    const [rows]: any = await db.query(
        `
        SELECT DISTINCT
            inf.id AS informe_id,
            inf.empresa_id,
            inf.tipo_periodo,
            DATE_FORMAT(inf.fecha_fin_periodo, '%Y-%m-%d') AS fecha_fin_periodo,
            i.ticker
        FROM informe_financiero inf
        INNER JOIN instrumento i
            ON i.empresa_id = inf.empresa_id
        INNER JOIN mercado m
            ON m.id = i.mercado_id
        WHERE inf.fuente = 'FINMIND'
          AND inf.fecha_fin_periodo IS NOT NULL
          AND UPPER(m.nombre_bolsa) IN (
              'TAIWAN STOCK EXCHANGE',
              'TAIPEI EXCHANGE'
          );
        `
    );

    console.log(`[TWOPT DEBUG] Filas SQL recibidas: ${rows.length}`);

    if (rows.length > 0) {

        console.log(
            "[TWOPT DEBUG] Primera fecha RAW:",
            rows[0].fecha_fin_periodo,
            "tipo:",
            typeof rows[0].fecha_fin_periodo
        );
    }

    const mapa = new Map<number, TWOPTInforme>();

    for (const r of rows) {
        const fecha = twOptFecha(r.fecha_fin_periodo);
        const id = Number(r.informe_id);

        if (!fecha || !id || mapa.has(id)) continue;

        mapa.set(id, {
            informe_id: id,
            empresa_id: Number(r.empresa_id),
            ticker: twOptTicker(r.ticker),
            tipo_periodo: String(r.tipo_periodo || ""),
            fecha_fin_periodo: fecha
        });
    }

    const out = Array.from(mapa.values());

    console.log(`[TWOPT] Informes pendientes: ${out.length}`);

    return out;
}

// ============================================================================
// AGRUPAR INFORMES POR EMPRESA - TAIWAN
// ============================================================================

function twOptAgrupar(informes: TWOPTInforme[]): Map<number, TWOPTInforme[]> {
    const mapa = new Map<number, TWOPTInforme[]>();

    for (const inf of informes) {
        const arr = mapa.get(inf.empresa_id) || [];

        arr.push(inf);

        mapa.set(inf.empresa_id, arr);
    }

    return mapa;
}


// ============================================================================
// PUNTO 5 - TAIWAN: ACCIONES EN CIRCULACION / EMITIDAS
// ============================================================================
// FinMind documenta NumberOfSharesIssued en TaiwanStockShareholding.
// Este dataset NO tiene el esquema type/value/origin_name, por lo que no debe
// forzarse dentro de TWOPT_CONCEPTOS. Se descarga aparte y se elige el último
// dato disponible en o antes de la fecha de cierre del informe.
// ============================================================================

interface TWOPTShareFact {
    date: string;
    numberOfSharesIssued: number;
}

async function twOptDescargarAccionesEmitidas(
    ticker: string,
    startDate: string
): Promise<TWOPTShareFact[]> {
    const url =
        `https://api.finmindtrade.com/api/v4/data` +
        `?dataset=TaiwanStockShareholding` +
        `&data_id=${encodeURIComponent(ticker)}` +
        `&start_date=${encodeURIComponent(startDate)}`;

    const json = await twOptFetch(url);
    if (!Array.isArray(json?.data)) return [];

    const out: TWOPTShareFact[] = [];

    for (const fila of json.data) {
        const date = twOptFecha(fila?.date);
        const value = twOptNumero(fila?.NumberOfSharesIssued);
        if (!date || value === null || value <= 0) continue;
        out.push({ date, numberOfSharesIssued: value });
    }

    out.sort((a, b) => a.date.localeCompare(b.date));
    return out;
}

function twOptAccionesParaFecha(
    facts: TWOPTShareFact[],
    fechaCierre: string
): TWOPTShareFact | null {
    let elegido: TWOPTShareFact | null = null;
    for (const fact of facts) {
        if (fact.date <= fechaCierre) elegido = fact;
        else break;
    }
    return elegido;
}

// ============================================================================
// DESCARGAR 4 AÑOS DE UN DATASET PARA UNA EMPRESA - TAIWAN
// ============================================================================

async function twOptDescargarDividendos(
    ticker: string,
    startDate: string
): Promise<TWOPTDividendFact[]> {

    const url =
        `https://api.finmindtrade.com/api/v4/data` +
        `?dataset=TaiwanStockDividend` +
        `&data_id=${encodeURIComponent(ticker)}` +
        `&start_date=${encodeURIComponent(startDate)}`;

    const json = await twOptFetch(url);

    if (!Array.isArray(json?.data)) {
        return [];
    }

    const out: TWOPTDividendFact[] = [];

    for (const fila of json.data) {

        const fechaPago =
            twOptFecha(fila?.CashDividendPaymentDate);

        if (!fechaPago) {
            continue;
        }

        const cashEarnings =
            twOptNumero(fila?.CashEarningsDistribution) ?? 0;

        const cashStatutory =
            twOptNumero(fila?.CashStatutorySurplus) ?? 0;

        const acciones =
            twOptNumero(fila?.ParticipateDistributionOfTotalShares);

        if (
            acciones === null ||
            acciones <= 0
        ) {
            continue;
        }

        const dividendoPorAccion =
            cashEarnings + cashStatutory;

        if (dividendoPorAccion <= 0) {
            continue;
        }

        const importeTotal =
            dividendoPorAccion * acciones;

        if (
            !Number.isFinite(importeTotal) ||
            importeTotal <= 0
        ) {
            continue;
        }

        out.push({
            fechaPago,
            importeTotal
        });
    }

    out.sort(
        (a, b) =>
            a.fechaPago.localeCompare(b.fechaPago)
    );

    return out;
}

function twOptDividendosParaInforme(
    dividendos: TWOPTDividendFact[],
    informe: TWOPTInforme
): number | null {

    const fechaFin =
        informe.fecha_fin_periodo;

    const fin =
        new Date(`${fechaFin}T00:00:00Z`);

    if (isNaN(fin.getTime())) {
        return null;
    }

    const inicio =
        new Date(fin);

    inicio.setUTCFullYear(
        inicio.getUTCFullYear() - 1
    );

    const fechaInicio =
        inicio.toISOString().slice(0, 10);

    let total = 0;
    let encontrados = 0;

    for (const dividendo of dividendos) {

        if (
            dividendo.fechaPago > fechaInicio &&
            dividendo.fechaPago <= fechaFin
        ) {
            total += dividendo.importeTotal;
            encontrados++;
        }
    }

    return encontrados > 0
        ? total
        : null;
}

async function twOptDescargarDataset(
    dataset: string,
    ticker: string,
    startDate: string
): Promise<TWOPTFact[]> {
    const url =
        `https://api.finmindtrade.com/api/v4/data` +
        `?dataset=${encodeURIComponent(dataset)}` +
        `&data_id=${encodeURIComponent(ticker)}` +
        `&start_date=${encodeURIComponent(startDate)}`;

    const json = await twOptFetch(url);

    if (!Array.isArray(json?.data)) {
        return [];
    }

    const facts: TWOPTFact[] = [];

    for (const fila of json.data) {
        const date = twOptFecha(fila?.date);
        const value = twOptNumero(fila?.value);

        if (!date || value === null) continue;

        facts.push({
            dataset,
            date,
            type: String(fila?.type || "").trim(),
            origin_name: String(fila?.origin_name || "").trim(),
            value
        });
    }

    return facts;
}

// ============================================================================
// INDEXAR FACTS POR FECHA - TAIWAN
// ============================================================================

function twOptIndexarPorFecha(facts: TWOPTFact[]): Map<string, TWOPTFact[]> {
    const mapa = new Map<string, TWOPTFact[]>();

    for (const f of facts) {
        const arr = mapa.get(f.date) || [];

        arr.push(f);

        mapa.set(f.date, arr);
    }

    return mapa;
}

// ============================================================================
// BUSCAR CONCEPTO - TAIWAN
// ============================================================================

function twOptBuscarConcepto(
    facts: TWOPTFact[],
    def: TWOPTConcepto
): { fact: TWOPTFact; nivel: "ALTA" | "MEDIA" } | null {
    let mejor: TWOPTFact | null = null;
    let mejorScore = -Infinity;
    let mejorNivel: "ALTA" | "MEDIA" = "MEDIA";

    for (let aliasIndex = 0; aliasIndex < def.aliases.length; aliasIndex++) {
        const alias = twOptTexto(def.aliases[aliasIndex]);

        for (const fact of facts) {
            if (!def.datasets.includes(fact.dataset)) continue;

            const type = twOptTexto(fact.type);
            const origin = twOptTexto(fact.origin_name);

            let score = -1;
            let nivel: "ALTA" | "MEDIA" = "MEDIA";

            if (type === alias) {
                score = 120;
                nivel = aliasIndex === 0 ? "ALTA" : "MEDIA";
            } else if (type.includes(alias) || alias.includes(type)) {
                score = 90;
            } else if (origin === alias) {
                score = 80;
            } else if (origin.includes(alias)) {
                score = 60;
            } else {
                continue;
            }

            score += Math.max(0, 20 - aliasIndex * 2);

            if (score > mejorScore) {
                mejorScore = score;
                mejor = fact;
                mejorNivel = nivel;
            }
        }
    }

    return mejor ? { fact: mejor, nivel: mejorNivel } : null;
}

// ============================================================================
// EXTRAER PARTIDAS PARA UN INFORME - TAIWAN
// ============================================================================

function twOptExtraerPartidas(
    informe: TWOPTInforme,
    factsFecha: TWOPTFact[],
    taxonomiaIds: Map<string, number>
): TWOPTPartida[] {
    const out: TWOPTPartida[] = [];

    for (const def of TWOPT_CONCEPTOS) {
        const conceptoId = taxonomiaIds.get(def.codigo);

        if (!conceptoId) continue;

        const encontrado = twOptBuscarConcepto(factsFecha, def);

        if (!encontrado) continue;

        out.push({
            informeId: informe.informe_id,
            conceptoEstandarId: conceptoId,
            conceptoOriginal: encontrado.fact.type || encontrado.fact.origin_name,
            importe: encontrado.fact.value,
            nivelConfianza: encontrado.nivel
        });
    }

    return out;
}

// ============================================================================
// GUARDAR PARTIDAS - TAIWAN
// ============================================================================

async function twOptGuardarPartidas(partidas: TWOPTPartida[]): Promise<number> {
    if (partidas.length === 0) return 0;

    const db = conexion as any;
    const mapa = new Map<string, TWOPTPartida>();

    for (const p of partidas) {
        mapa.set(`${p.informeId}|${p.conceptoEstandarId}`, p);
    }

    const valores = Array.from(mapa.values()).map(p => [
        p.informeId,
        p.conceptoEstandarId,
        p.conceptoOriginal,
        p.importe,
        p.nivelConfianza
    ]);

    const [resultado]: any = await db.query(
        `
        INSERT INTO partida_contable_valor (
            informe_id,
            concepto_estandar_id,
            concepto,
            importe,
            nivel_confianza
        )
        VALUES ?
        ON DUPLICATE KEY UPDATE
            concepto = VALUES(concepto),
            importe = VALUES(importe),
            nivel_confianza = VALUES(nivel_confianza)
        `,
        [valores]
    );

    return Number(resultado?.affectedRows || valores.length);
}

// ============================================================================
// MOTOR PRINCIPAL OPTIMIZADO - TAIWAN
// ============================================================================

export async function ejecutarCargaPartidasContablesTaiwanOptimizado() {
    const inicio = Date.now();

    console.log("\n======================================================");
    console.log(" PARTIDA_CONTABLE_VALOR - TAIWAN / FINMIND OPTIMIZADO");
    console.log("======================================================");

    TWOPT_TOKEN_STATES = twOptCrearTokenStates();

    if (TWOPT_TOKEN_STATES.length === 0) {
        throw new Error(
            "No hay ningún token FinMind configurado."
        );
    }

    console.log(
        `[TWOPT] API tokens: ${TWOPT_TOKEN_STATES.length} | ` +
        `workers: ${TWOPT_WORKERS} | ` +
        `ritmo/token: ${TWOPT_RPM} req/min`
    );

    const taxonomiaIds = await twOptPrepararTaxonomia();
    const informes = await twOptCargarInformesPendientes();

    if (informes.length === 0) {
        console.log("[TWOPT] No hay informes pendientes.");

        return {
            empresas: 0,
            informes: 0,
            partidas: 0,
            operacionesBD: 0,
            errores: 0,
            duracionMs: Date.now() - inicio
        };
    }

    const porEmpresa = twOptAgrupar(informes);
    const startDate = twOptStartDate();

    let empresasProcesadas = 0;
    let empresasError = 0;
    let informesProcesados = 0;
    let informesSinDatos = 0;
    let partidasDetectadas = 0;
    let operacionesBD = 0;

    const datasets = [
        "TaiwanStockFinancialStatements",
        "TaiwanStockBalanceSheet",
        "TaiwanStockCashFlowsStatement"
    ];

    const empresas = Array.from(porEmpresa.entries());
    let siguienteIndice = 0;
    let detenerPorCuota = false;

    async function worker(workerId: number): Promise<void> {
    while (true) {

        // Detener todos los workers si se agotó la cuota FinMind
        if (detenerPorCuota) {
            return;
        }

        const indice = siguienteIndice++;

        if (indice >= empresas.length) {
            return;
        }

            const [empresaId, informesEmpresa] = empresas[indice];
            const ticker = informesEmpresa[0]?.ticker;

            try {
                const todosFacts: TWOPTFact[] = [];

                // PUNTO 5: acciones emitidas se obtienen de TaiwanStockShareholding.
                const accionesEmitidas = await twOptDescargarAccionesEmitidas(
                    ticker,
                    startDate
                );

                const dividendosPagados = await twOptDescargarDividendos(
                        ticker,
                        startDate
                    );

                // Conservamos la lógica de los 3 datasets contables:
                // 3 datasets por empresa. La concurrencia está entre empresas.
                for (const dataset of datasets) {
                    const facts = await twOptDescargarDataset(
                        dataset,
                        ticker,
                        startDate
                    );

                    todosFacts.push(...facts);
                }

                const porFecha = twOptIndexarPorFecha(todosFacts);
                const partidasEmpresa: TWOPTPartida[] = [];

                for (const informe of informesEmpresa) {
                    const factsFecha =
                        porFecha.get(informe.fecha_fin_periodo) || [];

                    informesProcesados++;

                    if (factsFecha.length === 0) {
                        informesSinDatos++;
                        continue;
                    }

                    const partidas = twOptExtraerPartidas(
                        informe,
                        factsFecha,
                        taxonomiaIds
                    );

                    // ================================================================
                    // ACCIONES EN CIRCULACION / EMITIDAS - TAIWAN
                    // Fuente: TaiwanStockShareholding -> NumberOfSharesIssued
                    // Se utiliza el último dato disponible <= fecha cierre del informe.
                    // ================================================================

                    const conceptoAccionesId =
                        taxonomiaIds.get("ACCIONES_EN_CIRCULACION");

                    if (conceptoAccionesId) {

                        const accionesFecha = twOptAccionesParaFecha(
                            accionesEmitidas,
                            informe.fecha_fin_periodo
                        );

                        if (accionesFecha) {

                            partidas.push({
                                informeId: informe.informe_id,
                                conceptoEstandarId: conceptoAccionesId,
                                conceptoOriginal: "NumberOfSharesIssued",
                                importe: accionesFecha.numberOfSharesIssued,
                                nivelConfianza: "ALTA"
                            });
                        }
                    }
                    // ================================================================
                    // DIVIDENDOS PAGADOS - TAIWAN
                    // Fuente independiente: TaiwanStockDividend
                    // ================================================================

                    const conceptoDividendosId =
                        taxonomiaIds.get("DIVIDENDOS_PAGADOS");

                    if (!conceptoDividendosId) {
                        throw new Error(
                            "DIVIDENDOS_PAGADOS no existe en TAXONOMIA_CONCEPTO"
                        );
                    }

                    const dividendosInforme =
                        twOptDividendosParaInforme(
                            dividendosPagados,
                            informe
                        );

                    if (
                        dividendosInforme !== null &&
                        dividendosInforme > 0
                    ) {
                        partidas.push({
                            informeId: informe.informe_id,
                            conceptoEstandarId: conceptoDividendosId,
                            conceptoOriginal: "TaiwanStockDividend",
                            importe: dividendosInforme,
                            nivelConfianza: "ALTA"
                        });
                    }
                    
                    partidasDetectadas += partidas.length;
                    partidasEmpresa.push(...partidas);
                }

                if (partidasEmpresa.length > 0) {
                    const guardadas = await twOptGuardarPartidas(
                        partidasEmpresa
                    );

                    operacionesBD += guardadas;
                }

                empresasProcesadas++;

                if (
                    empresasProcesadas % 25 === 0 ||
                    empresasProcesadas === empresas.length
                ) {
                    console.log(
                        `[TWOPT] Empresas ${empresasProcesadas}/${empresas.length} | ` +
                        `informes ${informesProcesados} | ` +
                        `partidas ${partidasDetectadas} | ` +
                        `sin datos ${informesSinDatos} | ` +
                        `errores ${empresasError}`
                    );
                }

                if ((indice + 1) % 250 === 0) {
                    console.log(
                        `[TWOPT] Worker ${workerId}: alcanzado indice ${indice + 1}.`
                    );
                }
          } catch (error) {

    const mensaje =
        error instanceof Error
            ? error.message
            : String(error);

    // Si todos los tokens FinMind están agotados,
    // activar parada global de todos los workers.
    if (mensaje.includes("FINMIND_QUOTA_EXHAUSTED")) {

        detenerPorCuota = true;

        console.warn(
            "\n[TWOPT] CUOTA FINMIND AGOTADA EN TODOS LOS TOKENS."
        );

        console.warn(
            "[TWOPT] Se detiene Taiwan. " +
            "Las empresas restantes NO se contabilizan como errores.\n"
        );

        return;
    }

    // Cualquier otro error sí cuenta como error real.
    empresasError++;

    console.error(
        `[TWOPT] Error empresa ${empresaId} ticker ${ticker}:`,
        mensaje
    );
} 
        }
    }

    const workersReales = Math.min(
        TWOPT_WORKERS,
        empresas.length
    );

    await Promise.all(
        Array.from(
            { length: workersReales },
            (_, i) => worker(i + 1)
        )
    );

    const duracionMs = Date.now() - inicio;

    console.log("\n[TWOPT] RESUMEN FINAL");
    console.log(`- Empresas: ${porEmpresa.size}`);
    console.log(`- Empresas procesadas: ${empresasProcesadas}`);
    console.log(`- Empresas con error: ${empresasError}`);
    console.log(`- Informes procesados: ${informesProcesados}`);
    console.log(`- Informes sin datos: ${informesSinDatos}`);
    console.log(`- Partidas detectadas: ${partidasDetectadas}`);
    console.log(`- Operaciones BD: ${operacionesBD}`);
    console.log(`- Tiempo total: ${(duracionMs / 1000).toFixed(1)} s`);

    for (const estado of TWOPT_TOKEN_STATES) {
        console.log(
            `[TWOPT] Token ${estado.id}: ` +
            `requests=${estado.requests} | ` +
            `rate-limit=${estado.rateLimits} | ` +
            `errores=${estado.errores}`
        );
    }

    return {
        empresas: porEmpresa.size,
        empresasProcesadas,
        empresasError,
        informesProcesados,
        informesSinDatos,
        partidasDetectadas,
        operacionesBD,
        tokens: TWOPT_TOKEN_STATES.map(estado => ({
            token: estado.id,
            requests: estado.requests,
            rateLimits: estado.rateLimits,
            errores: estado.errores
        })),
        duracionMs
    };
}

// ============================================================================
// ENDPOINT EXPRESS - TAIWAN
// POST /api/partida-contable-valor/taiwan/actualizar
// ============================================================================

export async function actualizarPartidasContablesTaiwanOptimizado(
    _req: Request,
    res: Response
): Promise<void> {
    try {
        const resultado = await ejecutarCargaPartidasContablesTaiwanOptimizado();

        res.status(200).json({
            ok: true,
            mensaje: "Carga optimizada PARTIDA_CONTABLE_VALOR Taiwan finalizada.",
            resumen: resultado
        });
    } catch (error) {
        console.error("[TWOPT] ERROR CRITICO:", error);

        res.status(500).json({
            ok: false,
            mensaje: "No se pudo cargar PARTIDA_CONTABLE_VALOR Taiwan.",
            error: error instanceof Error ? error.message : String(error)
        });
    }
}

// ============================================================================
// EJECUCION DIRECTA - TAIWAN (activo)
//
// Para probar manualmente: npx ts-node insercionPartidaContableValor.ts
// Si USA/Japon estan en el mismo archivo, comentar sus ejecuciones directas.
// ============================================================================

ejecutarCargaPartidasContablesTaiwanOptimizado()
  .then(resultado => {
      console.log("\n=== PARTIDA_CONTABLE_VALOR TAIWAN OPTIMIZADO FINALIZADO ===");
      console.log(resultado);
 })
  .catch(error => {
      console.error("\n=== ERROR CRITICO TAIWAN OPTIMIZADO ===", error);
      process.exitCode = 1;
  });