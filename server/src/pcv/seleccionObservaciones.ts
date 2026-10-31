// SELECCION_OBSERVACIONES_V1 — selección determinista de la observación contable de un concepto en un informe cuando
// partida_contable_valor contiene varias filas (originales repetidos por distintas recuperaciones o etiquetas
// distintas mapeadas al mismo concepto estándar). Nunca decide por el valor (ni mayor, ni menor, ni más reciente):
//  1. EVIDENCIA PRIMARIA: si hay filas certificadas por la fuente primaria (record_id/record_ids de INSERTED,
//     NULL_FILLED o VERIFIED_EXISTING para ese informe y concepto) y todas tienen el mismo importe, se seleccionan.
//  2. ETIQUETA: sin certificación, se descartan las etiquetas secundarias del mismo documento — sección resumen
//     («主要な経営指標等の推移», *SummaryOfBusinessResults) y extensiones propias de la empresa (jpcrp030000-asr_E…) —
//     si queda al menos una etiqueta del estado financiero principal.
//  3. Si aún hay importes distintos, la celda queda SIN RESOLVER (no se calcula nada con ella) con su causa.
// Las filas originales no se modifican: esta capa sólo decide qué observación consume el cálculo.
export const POLITICA_SELECCION = "SELECCION_OBSERVACIONES_V1";

export interface FilaObservacion { id?: number; concepto_estandar: string; concepto: string; importe: unknown }
export interface ResultadoSeleccion<T extends FilaObservacion> {
    filas: T[];
    sinResolver: { concepto: string; motivo: string; importes: string[]; etiquetas: string[] }[];
    resueltas: { concepto: string; criterio: "EVIDENCIA_PRIMARIA" | "ETIQUETA_ESTADO_PRINCIPAL" }[];
}

const SALDOS = new Set(["INVENTARIOS", "CUENTAS_COBRAR", "CUENTAS_PAGAR", "EFECTIVO", "DEUDA_CORTO_PLAZO", "DEUDA_LARGO_PLAZO", "PATRIMONIO_NETO", "ACTIVOS_TOTALES", "PASIVOS_TOTALES"]);
const secundaria = (tag: string) => /SummaryOfBusinessResults$/.test(tag) || /^jpcrp\d{6}-[a-z]+_E\d{5}-\d{3}:/.test(tag);
const importe = (v: unknown) => (v === null || v === undefined || v === "" ? null : String(Number(v)));

export function seleccionarObservaciones<T extends FilaObservacion>(filas: T[], certificadas: Map<string, Set<number>> = new Map()): ResultadoSeleccion<T> {
    const porConcepto = new Map<string, T[]>();
    // Mismo prefiltro que normalizarPartidas: movimientos en conceptos de saldo y reservas/reversiones en D&A no son la
    // magnitud del concepto y no pueden hacer «contradictoria» una celda.
    const noEsMagnitud = (f: T) => (SALDOS.has(f.concepto_estandar.toUpperCase()) && /writedown|reversal|increase|decrease|changein|impairment/i.test(f.concepto)) || (f.concepto_estandar.toUpperCase() === "DEPRECIACION_AMORTIZACION" && /reversal|reserve|impairment/i.test(f.concepto));
    for (const f of filas) { if (noEsMagnitud(f)) continue; (porConcepto.get(f.concepto_estandar) ?? porConcepto.set(f.concepto_estandar, []).get(f.concepto_estandar)!).push(f); }
    const out: T[] = [], sinResolver: ResultadoSeleccion<T>["sinResolver"] = [], resueltas: ResultadoSeleccion<T>["resueltas"] = [];
    for (const [concepto, grupo] of porConcepto) {
        const conValor = grupo.filter(f => importe(f.importe) !== null);
        const distintos = new Set(conValor.map(f => importe(f.importe)));
        if (distintos.size <= 1) { out.push(...grupo); continue; }
        const ids = certificadas.get(concepto);
        const cert = ids ? conValor.filter(f => f.id !== undefined && ids.has(f.id)) : [];
        if (cert.length && new Set(cert.map(f => importe(f.importe))).size === 1) { out.push(...cert); resueltas.push({ concepto, criterio: "EVIDENCIA_PRIMARIA" }); continue; }
        const principales = conValor.filter(f => !secundaria(f.concepto));
        if (principales.length && principales.length < conValor.length && new Set(principales.map(f => importe(f.importe))).size === 1) {
            out.push(...principales); resueltas.push({ concepto, criterio: "ETIQUETA_ESTADO_PRINCIPAL" }); continue;
        }
        sinResolver.push({ concepto, motivo: cert.length ? "EVIDENCIA_PRIMARIA_CONTRADICTORIA" : "ETIQUETAS_PRINCIPALES_CONTRADICTORIAS", importes: [...distintos].map(String), etiquetas: [...new Set(conValor.map(f => f.concepto))] });
    }
    return { filas: out, sinResolver, resueltas };
}

// Perímetro contable de beneficio y patrimonio según la etiqueta XBRL de la observación seleccionada:
//  DOMINANTE — atribuible a los accionistas de la sociedad dominante (US-GAAP NetIncomeLoss/StockholdersEquity,
//              IFRS *AttributableToOwnersOfParent, JGAAP ProfitAttributableToOwnersOfParent);
//  TOTAL     — consolidado incluidas las participaciones no dominantes (ProfitLoss, NetAssets, EquityIFRS,
//              *IncludingPortionAttributableToNoncontrollingInterest, FinMind IncomeAfterTaxes/Equity).
// null = no determinable. ROE sólo es coherente si beneficio y patrimonio comparten perímetro.
export type Perimetro = "DOMINANTE" | "TOTAL" | null;
export function perimetroDeEtiqueta(concepto: string, tag: string): Perimetro {
    const t = tag.split(":").pop() ?? "";
    if (/AttributableToOwnersOfParent|AttributableToParent$/.test(t)) return "DOMINANTE";
    if (/IncludingPortionAttributableToNoncontrollingInterest/.test(t)) return "TOTAL";
    if (concepto === "BENEFICIO_NETO") {
        if (["NetIncomeLoss", "NetIncomeLossAvailableToCommonStockholdersBasic"].includes(t)) return "DOMINANTE";
        if (["ProfitLoss", "ProfitLossIFRS", "IncomeAfterTaxes", "NetIncome"].includes(t)) return "TOTAL";
    }
    if (concepto === "PATRIMONIO_NETO") {
        if (["StockholdersEquity", "PartnersCapital", "MembersEquity"].includes(t)) return "DOMINANTE";
        if (["NetAssets", "Equity", "EquityIFRS", "NetAssetsSummaryOfBusinessResults"].includes(t)) return "TOTAL";
    }
    return null;
}

// Identidad de observación (migración 33): SHA-256 de «informe_id|concepto_estandar_id|etiqueta», idéntica a
// SHA2(CONCAT_WS('|',informe_id,concepto_estandar_id,concepto),256). El informe fija documento y periodo.
import { createHash } from "node:crypto";
export function identidadObservacion(informeId: number, conceptoEstandarId: number, concepto: string): string {
    return createHash("sha256").update(`${informeId}|${conceptoEstandarId}|${concepto ?? ""}`).digest("hex");
}
