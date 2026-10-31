// Conectores J-Quants API V2 y Eulerpool sobre el guardián HTTP compartido (guardiaHttp.ts).
//
// J-Quants (https://jpx-jquants.com/en/spec): autenticación `x-api-key`. Plan Free: sólo /v2/fins/summary
// (resumen de 決算短信, 2 años con 12 semanas de retraso); /v2/fins/details (BS/PL/CF completos) es Premium y
// devuelve 403 "not available on your subscription": se memoriza como fallo permanente y no se reintenta.
// Límite propio de fins/summary: 60/min; 429 sin Retry-After → esperar >= 2 min (documentación oficial).
// Condiciones JPX: servicio para inversores individuales; prohibido el uso comercial y la redistribución.
//
// Eulerpool (OpenAPI https://api.eulerpool.com/api/1/documentation/yaml): `Authorization: Bearer`. Plan gratuito
// 100.000 llamadas/mes (cabeceras x-ratelimit-*), uso NO comercial. Datos estandarizados de terceros, en millones,
// sin documento ni fecha de publicación: sólo sirven para contrastar, nunca para certificar.
//
// Ninguna clave se escribe en logs, errores, estado ni respuestas: se leen de JQUANTS_API_KEY / EULERPOOL_API_KEY.
import { GuardiaProveedor, PoliticaProveedor, directorioGuardias, ErrorProveedor } from "./guardiaHttp";

const MINUTO = 60000, HORA = 3600000;

export function politicaJQuants(): PoliticaProveedor {
    return {
        proveedor: "jquants",
        maxPorHora: 1800,            // 30/min: la mitad del límite propio de fins/summary (60/min)
        separacionMinimaMs: 2000,
        pausaBloqueoIpMs: 10 * MINUTO,
        pausa429Ms: 2 * MINUTO,
        pausaCuotaMs: 60 * MINUTO,
        maxReintentosTransitorios: 3,
        backoffBaseMs: 5000,
        backoffMaxMs: 2 * MINUTO,
        umbralCircuito: 5,
        pausaCircuitoMs: 10 * MINUTO,
        memoriaPermanenteMs: 24 * HORA,
        timeoutMs: 30000,
        esBloqueoIp: () => false     // 403 en J-Quants = endpoint fuera del plan (permanente)
    };
}

export function politicaEulerpool(): PoliticaProveedor {
    return {
        proveedor: "eulerpool",
        maxPorHora: 600,
        separacionMinimaMs: 1500,
        pausaBloqueoIpMs: 35 * MINUTO,
        pausa429Ms: 5 * MINUTO,
        pausaCuotaMs: 24 * HORA,     // cuota mensual agotada: no insistir
        maxReintentosTransitorios: 3,
        backoffBaseMs: 5000,
        backoffMaxMs: 2 * MINUTO,
        umbralCircuito: 5,
        pausaCircuitoMs: 15 * MINUTO,
        memoriaPermanenteMs: 7 * 24 * HORA,
        timeoutMs: 30000,
        esBloqueoIp: (_s, cuerpo) => /banned|blocked/i.test(cuerpo)
    };
}

function clave(nombre: string, entorno: NodeJS.ProcessEnv): string {
    const k = String(entorno[nombre] ?? "").trim();
    if (!k) throw new ErrorProveedor("CREDENCIAL_NO_CONFIGURADA", `Falta ${nombre} en el entorno o en .env`);
    return k;
}

export class JQuants {
    private guardia: GuardiaProveedor;
    private key: string;
    constructor(entorno: NodeJS.ProcessEnv = process.env, dir = directorioGuardias(entorno), guardia?: GuardiaProveedor) {
        this.key = clave("JQUANTS_API_KEY", entorno);
        this.guardia = guardia ?? new GuardiaProveedor(politicaJQuants(), dir, [this.key]);
    }
    async get(ruta: string, params: Record<string, string>): Promise<any> {
        const u = new URL("https://api.jquants.com" + ruta);
        for (const [k, v] of Object.entries(params)) if (v) u.searchParams.set(k, v);
        const r = await this.guardia.solicitar(u.toString(), { headers: { "x-api-key": this.key, Accept: "application/json" } });
        return JSON.parse(r.texto);
    }
    // Todas las páginas de /v2/fins/summary para una fecha de publicación (TDnet, JST) o un código.
    async resumenes(params: { date?: string; code?: string }): Promise<any[]> {
        const filas: any[] = [];
        let pagination_key = "";
        do {
            const j = await this.get("/v2/fins/summary", { ...(params as Record<string, string>), pagination_key });
            filas.push(...(Array.isArray(j.data) ? j.data : []));
            pagination_key = j.pagination_key ?? "";
        } while (pagination_key);
        return filas;
    }
}

export class Eulerpool {
    private guardia: GuardiaProveedor;
    private key: string;
    constructor(entorno: NodeJS.ProcessEnv = process.env, dir = directorioGuardias(entorno), guardia?: GuardiaProveedor) {
        this.key = clave("EULERPOOL_API_KEY", entorno);
        this.guardia = guardia ?? new GuardiaProveedor(politicaEulerpool(), dir, [this.key]);
    }
    async equity(endpoint: "profile" | "incomestatement" | "balancesheet" | "cashflowstatement", identificador: string): Promise<{ datos: any; limite: { restante: number | null; ventana: string | null } }> {
        if (!/^[A-Z0-9.]{3,20}$/.test(identificador)) throw new ErrorProveedor("IDENTIFICADOR_INVALIDO", "Identificador no válido");
        const r = await this.guardia.solicitar(`https://api.eulerpool.com/api/1/equity/${endpoint}/${identificador}`, { headers: { Authorization: `Bearer ${this.key}`, Accept: "application/json" } });
        const restante = r.cabeceras.get("x-ratelimit-remaining");
        return { datos: JSON.parse(r.texto), limite: { restante: restante === null ? null : Number(restante), ventana: r.cabeceras.get("x-ratelimit-window") } };
    }
}

// ISIN de una acción de Taiwán a partir del código bursátil de 4-6 caracteres: TW000 + código + relleno + Luhn.
export function isinTaiwan(codigo: string): string {
    if (!/^\d{4}$/.test(codigo)) throw new Error("Sólo códigos TW de 4 dígitos");
    const base = "TW000" + codigo + "00";
    return base + digitoControlIsin(base);
}

export function digitoControlIsin(base11: string): string {
    const digitos = base11.toUpperCase().split("").map(ch => /\d/.test(ch) ? ch : String(ch.charCodeAt(0) - 55)).join("");
    let suma = 0;
    for (let i = 0; i < digitos.length; i++) {
        let d = Number(digitos[digitos.length - 1 - i]);
        if (i % 2 === 0) { d *= 2; if (d > 9) d -= 9; }
        suma += d;
    }
    return String((10 - (suma % 10)) % 10);
}

// Campos del resumen J-Quants comparables con los PCV (montos en yenes, sin conversión de escala; NP = atribuible
// a la dominante). El patrimonio (Eq, 純資産) incluye minoritarios en JGAAP: sólo se compara si el PCV es el mismo
// agregado, por eso queda fuera de este mapa.
export const MAPA_JQUANTS: Record<string, string> = {
    Sales: "INGRESOS", OP: "EBIT", NP: "BENEFICIO_NETO", TA: "ACTIVOS_TOTALES", CFO: "FLUJO_CAJA_OPERATIVO", CashEq: "EFECTIVO"
};

// Resumen anual consolidado (DocType FYFinancialStatements_Consolidated_*) → {codigo, importe}.
export function anualConsolidadoJQuants(fila: any): { code: string; fin: string; norma: string; disc: string; discNo: string; valores: Record<string, number> } | null {
    const doc = String(fila?.DocType ?? "");
    const m = /^FYFinancialStatements_Consolidated_(JP|IFRS|US|JMIS)$/.exec(doc);
    if (!m || fila.CurPerType !== "FY" || !/^\d{4}-\d{2}-\d{2}$/.test(fila.CurFYEn ?? "")) return null;
    const valores: Record<string, number> = {};
    for (const [campo, codigo] of Object.entries(MAPA_JQUANTS)) {
        const s = String(fila[campo] ?? "").trim();
        if (s === "") continue;            // vacío = no declarado; nunca se convierte en 0
        const v = Number(s);
        if (Number.isFinite(v)) valores[codigo] = v;
    }
    return { code: String(fila.Code), fin: fila.CurFYEn, norma: m[1], disc: fila.DiscDate, discNo: String(fila.DiscNo), valores };
}

// Eulerpool → PCV comparables (millones → unidades). Sólo campos con definición inequívoca en su OpenAPI.
export const MAPA_EULERPOOL: Record<string, Record<string, string>> = {
    incomestatement: { revenue: "INGRESOS", grossIncome: "BENEFICIO_BRUTO", ebit: "EBIT", pretaxIncome: "BENEFICIO_ANTES_IMPUESTOS", netIncome: "BENEFICIO_NETO" },
    // `allAssets`/`assets`/`equity` no son totales fiables (Hon Hai 2024: allAssets 3,42 billones frente a 4,39 del
    // balance consolidado; `assets` es un subtotal): no se usan para contrastar.
    balancesheet: { inventory: "INVENTARIOS", accountsReceivables: "CUENTAS_COBRAR", accountsPayable: "CUENTAS_PAGAR" },
    cashflowstatement: { netOperatingCashFlow: "FLUJO_CAJA_OPERATIVO", capex: "CAPEX", cashDividendsPaid: "DIVIDENDOS_PAGADOS" }
};

export function filasEulerpool(endpoint: string, datos: any[]): { fin: string; codigo: string; importe: number }[] {
    const mapa = MAPA_EULERPOOL[endpoint] ?? {};
    const out: { fin: string; codigo: string; importe: number }[] = [];
    for (const f of Array.isArray(datos) ? datos : []) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(String(f?.period ?? ""))) continue;   // descarta estimaciones ("2026-12-31e")
        for (const [campo, codigo] of Object.entries(mapa)) {
            const v = f[campo];
            if (typeof v !== "number" || !Number.isFinite(v)) continue;        // null ≠ 0
            out.push({ fin: f.period, codigo, importe: ["CAPEX", "DIVIDENDOS_PAGADOS"].includes(codigo) ? Math.abs(v) * 1e6 : v * 1e6 });
        }
    }
    return out;
}
