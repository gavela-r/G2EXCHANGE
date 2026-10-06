import { existsSync } from "fs";
import conexion from "../conexion/bd";
import { Request, Response } from "express";

// ============================================================================
// TIPOS
// ============================================================================

interface InstrumentoEvento {
    instrumento_id: number;
    ticker: string;
    isin: string | null;
    mercado: string;
}

interface EventoCorporativoNormalizado {
    instrumentoId: number;
    tipoEvento: string;
    fecha: string;
    valorORatio: number | null;
}

// ============================================================================
// CONFIGURACIÓN
// ============================================================================

const EC_ALPACA_API_KEY = "PKYCO53R524KFTZ3OYYTWRRSC2";
const EC_ALPACA_API_SECRET = "AS5x5THDykUJyBF1y38EK6vem8BVrA8wmzmxuvdA5dto";
const EC_DAYS_BACK = Number(process.env.EVENTO_CORPORATIVO_DAYS_BACK || 365 * 4);

// ============================================================================
// UTILIDADES
// ============================================================================

function ecFecha(valor: unknown): string | null {
    if (!valor) return null;
    const texto = String(valor).trim().slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(texto) ? texto : null;
}

function ecNumero(valor: unknown): number | null {
    if (valor === null || valor === undefined || valor === "") return null;
    const n = Number(valor);
    return Number.isFinite(n) ? n : null;
}

function ecRangoFechas(): { start: string; end: string } {
    const end = new Date();
    const start = new Date();
    start.setUTCDate(start.getUTCDate() - EC_DAYS_BACK);
    return {
        start: start.toISOString().slice(0, 10),
        end: end.toISOString().slice(0, 10)
    };
}


// ============================================================================
// NORMALIZACIÓN DEL TIPO DE EVENTO
// ============================================================================

function ecNormalizarTipo(raw: any): string {
    const tipo = String(raw?.type || raw?.ca_type || raw?.__array_type || "").trim().toLowerCase();

    switch (tipo) {
        case "forward_split":
        case "forward_splits":
        case "reverse_split":
        case "reverse_splits":
        case "unit_split":
        case "unit_splits":
            return "SPLIT";

        case "cash_dividend":
        case "cash_dividends":
        case "stock_dividend":
        case "stock_dividends":
            return "DIVIDENDO";

        case "spin_off":
        case "spin_offs":
            return "SPIN_OFF";

        case "cash_merger":
        case "cash_mergers":
        case "stock_merger":
        case "stock_mergers":
        case "stock_and_cash_merger":
        case "stock_and_cash_mergers":
            return "MERGER";

        case "redemption":
        case "redemptions":
            return "REDEMPTION";

        case "name_change":
        case "name_changes":
            return "NAME_CHANGE";

        case "worthless_removal":
        case "worthless_removals":
            return "WORTHLESS_REMOVAL";

        case "rights_distribution":
        case "rights_distributions":
            return "RIGHTS_DISTRIBUTION";

        case "partial_call":
        case "partial_calls":
            return "PARTIAL_CALL";

        case "reorganization":
        case "reorganizations":
            return "REORGANIZATION";

        default:
            return tipo ? tipo.toUpperCase() : "OTRO";
    }
}

// ============================================================================
// VALOR / RATIO
// ============================================================================

function ecCalcularValor(raw: any, tipoEvento: string): number | null {
    const newRate = ecNumero(raw?.new_rate);
    const oldRate = ecNumero(raw?.old_rate);

    if (newRate !== null && oldRate !== null && oldRate !== 0) {
        return newRate / oldRate;
    }

    if (tipoEvento === "DIVIDENDO") {
        return (
            ecNumero(raw?.cash) ??
            ecNumero(raw?.amount) ??
            ecNumero(raw?.rate) ??
            ecNumero(raw?.cash_amount) ??
            null
        );
    }

    return ecNumero(raw?.amount) ?? ecNumero(raw?.rate) ?? null;
}

// ============================================================================
// CARGAR INSTRUMENTOS
// ============================================================================

async function ecCargarInstrumentosAlpaca(): Promise<InstrumentoEvento[]> {
    const db = conexion as any;

    const [rows]: any = await db.query(`
        SELECT DISTINCT
            i.id AS instrumento_id,
            i.ticker,
            i.isin,
            m.nombre_bolsa AS mercado
        FROM instrumento i
        INNER JOIN mercado m ON m.id = i.mercado_id
        WHERE i.isin IS NOT NULL
        AND TRIM(i.isin) <> ''
        AND UPPER(m.nombre_bolsa) IN (
            'NASDAQ STOCK MARKET',
            'NEW YORK STOCK EXCHANGE',
            'NYSE AMERICAN'
        )
    `);

    return rows.map((row: any) => ({
        instrumento_id: Number(row.instrumento_id),
        ticker: String(row.ticker || "").trim().toUpperCase(),
        isin: row.isin ? String(row.isin).trim().toUpperCase() : null,
        mercado: String(row.mercado || "")
    }));
}


// 2) Para Japón + Taiwán — SIN filtro de ISIN
async function ecCargarInstrumentosAsia(): Promise<InstrumentoEvento[]> {
    const db = conexion as any;

    const [rows]: any = await db.query(`
        SELECT DISTINCT
            i.id AS instrumento_id,
            i.ticker,
            i.isin,
            m.nombre_bolsa AS mercado
        FROM instrumento i
        INNER JOIN mercado m ON m.id = i.mercado_id
        WHERE UPPER(m.nombre_bolsa) IN (
            'TOKYO STOCK EXCHANGE',
            'TAIWAN STOCK EXCHANGE',
            'TAIPEI EXCHANGE'
        )
    `);

    return rows.map((row: any) => ({
        instrumento_id: Number(row.instrumento_id),
        ticker: String(row.ticker || "").trim().toUpperCase(),
        isin: row.isin ? String(row.isin).trim().toUpperCase() : null,
        mercado: String(row.mercado || "")
    }));
}

// ============================================================================
// MAPA ISIN
// ============================================================================

function ecCrearMapaISIN(instrumentos: InstrumentoEvento[]): Map<string, InstrumentoEvento> {
    const mapa = new Map<string, InstrumentoEvento>();
    for (const instrumento of instrumentos) {
        if (!instrumento.isin) continue;
        mapa.set(instrumento.isin, instrumento);
    }
    return mapa;
}
// ============================================================================
// FETCH ALPACA
// ============================================================================

// ============================================================================
// FETCH ALPACA
// ============================================================================

async function ecFetchAlpaca(pageToken?: string): Promise<any> {
    if (!EC_ALPACA_API_KEY || !EC_ALPACA_API_SECRET) {
        throw new Error("Faltan ALPACA_API_KEY / ALPACA_API_SECRET en .env");
    }

    const rango = ecRangoFechasComplementario();
    const params = new URLSearchParams();

    params.set("start", rango.start);
    params.set("end", rango.end);
    params.set("region", "all");
    params.set("limit", "1000");
    params.set("sort", "asc");

    if (pageToken) params.set("page_token", pageToken);

    const url = `https://data.alpaca.markets/v1/corporate-actions?${params.toString()}`;

    const response = await fetch(url, {
        headers: {
            "APCA-API-KEY-ID": EC_ALPACA_API_KEY,
            "APCA-API-SECRET-KEY": EC_ALPACA_API_SECRET,
            "Accept": "application/json"
        }
    });

    if (!response.ok) {
        const body = await response.text();
        throw new Error(`Alpaca HTTP ${response.status}: ${body.slice(0, 300)}`);
    }

    return await response.json();
}

// ============================================================================
// APLANAR RESPUESTA ALPACA
// ============================================================================

function ecAplanarRespuesta(json: any): any[] {
    const resultado: any[] = [];

    const contenedor =
        json?.corporate_actions &&
        typeof json.corporate_actions === "object"
            ? json.corporate_actions
            : json;

    for (const [clave, valor] of Object.entries(contenedor || {})) {
        if (clave === "next_page_token") continue;
        if (!Array.isArray(valor)) continue;

        for (const raw of valor) {
            resultado.push({
                ...(raw as any),
                __array_type: clave
            });
        }
    }

    return resultado;
}

// ============================================================================
// NORMALIZAR EVENTO
// ============================================================================

function ecNormalizarEvento(raw: any, instrumento: InstrumentoEvento): EventoCorporativoNormalizado | null {
    const tipoEvento = ecNormalizarTipo(raw);

    const fecha =
        ecFecha(raw?.process_date) ||
        ecFecha(raw?.ex_date) ||
        ecFecha(raw?.declaration_date) ||
        ecFecha(raw?.record_date) ||
        ecFecha(raw?.payable_date);

    if (!fecha) return null;

    const valorORatio = ecCalcularValor(raw, tipoEvento);

    return {
        instrumentoId: instrumento.instrumento_id,
        tipoEvento,
        fecha,
        valorORatio
    };
}

// ============================================================================
// GUARDAR EVENTOS
// ============================================================================

async function ecGuardarEventos(eventos: EventoCorporativoNormalizado[]): Promise<number> {
    if (eventos.length === 0) return 0;

    const db = conexion as any;

    const valores = eventos.map(e => [
        e.instrumentoId,
        e.tipoEvento,
        e.fecha,
        e.valorORatio
    ]);

    const [resultado]: any = await db.query(
        `
        INSERT INTO evento_corporativo
        (instrumento_id, tipo_evento, fecha, valor_o_ratio)
        VALUES ?
        ON DUPLICATE KEY UPDATE valor_o_ratio = VALUES(valor_o_ratio)
        `,
        [valores]
    );

    return Number(resultado?.affectedRows || valores.length);
}

// ============================================================================
// CLASIFICACIÓN POR PAÍS
// ============================================================================

function ecPaisPorISIN(isin: string): "USA" | "JAPON" | "TAIWAN" | "OTRO" {
    if (isin.startsWith("US")) return "USA";
    if (isin.startsWith("JP")) return "JAPON";
    if (isin.startsWith("TW")) return "TAIWAN";
    return "OTRO";
}


// ============================================================================
// MOTOR PRINCIPAL - LOS 3 PAISES EN UNA SOLA EJECUCION
// ============================================================================

// ============================================================================
// MOTOR PRINCIPAL - USA + JAPON + TAIWAN
// ============================================================================

export async function ejecutarCargaEventoCorporativo() {

    const inicio = Date.now();

    console.log("\n======================================================");
    console.log(" EVENTO_CORPORATIVO - USA + JAPON + TAIWAN");
    console.log(" FUENTE V1: ALPACA CORPORATE ACTIONS GLOBAL");
    console.log("======================================================");

    const instrumentos = await ecCargarInstrumentosAlpaca();
    const mapaISIN = ecCrearMapaISIN(instrumentos);

    console.log(`[EC] Instrumentos con ISIN: ${mapaISIN.size}`);

    let pageToken: string | undefined;

    let eventosRaw = 0;
    let eventosConISIN = 0;
    let eventosCruzados = 0;
    let eventosSinInstrumento = 0;
    let operacionesBD = 0;

    const porPais = {
        USA: 0,
        JAPON: 0,
        TAIWAN: 0,
        OTRO: 0
    };

    const porTipo: Record<string, number> = {};

    do {
        const json = await ecFetchAlpaca(pageToken);
        const raws = ecAplanarRespuesta(json);

        eventosRaw += raws.length;

        const normalizados: EventoCorporativoNormalizado[] = [];

        for (const raw of raws) {

            const isin = raw?.isin
                ? String(raw.isin).trim().toUpperCase()
                : "";

            if (!isin) continue;

            eventosConISIN++;

            const pais = ecPaisPorISIN(isin);

            if (pais === "OTRO") {
                porPais.OTRO++;
                continue;
            }

            const instrumento = mapaISIN.get(isin);

            if (!instrumento) {
                eventosSinInstrumento++;
                continue;
            }

            const evento = ecNormalizarEvento(raw, instrumento);
            if (!evento) continue;

            normalizados.push(evento);

            eventosCruzados++;
            porPais[pais]++;

            porTipo[evento.tipoEvento] =
                (porTipo[evento.tipoEvento] || 0) + 1;
        }

        operacionesBD += await ecGuardarEventos(normalizados);

        pageToken = json?.next_page_token
            ? String(json.next_page_token)
            : undefined;

    } while (pageToken);

    const duracionMs = Date.now() - inicio;

    console.log("\n[EC] RESUMEN FINAL");
    console.log(`- Eventos recibidos Alpaca: ${eventosRaw}`);
    console.log(`- Eventos con ISIN: ${eventosConISIN}`);
    console.log(`- Eventos cruzados con nuestra BD: ${eventosCruzados}`);
    console.log(`- Eventos sin instrumento: ${eventosSinInstrumento}`);
    console.log(`- Operaciones BD: ${operacionesBD}`);
    console.log(`- USA: ${porPais.USA}`);
    console.log(`- JAPON: ${porPais.JAPON}`);
    console.log(`- TAIWAN: ${porPais.TAIWAN}`);
    console.log(`- Tipos:`, porTipo);
    console.log(`- Tiempo: ${(duracionMs / 1000).toFixed(1)} s`);

    return {
        instrumentos: mapaISIN.size,
        eventosRaw,
        eventosConISIN,
        eventosCruzados,
        eventosSinInstrumento,
        operacionesBD,
        porPais,
        porTipo,
        duracionMs
    };
}

// ============================================================================
// ENDPOINT EXPRESS
// ============================================================================
//
// POST:
//
// /api/evento-corporativo/actualizar
//
// ============================================================================

export async function actualizarEventoCorporativo(_req: Request, res: Response): Promise<void> {
    try {
        const resultado = await ejecutarCargaEventoCorporativo();

        res.status(200).json({
            ok: true,
            mensaje: "EVENTO_CORPORATIVO actualizado.",
            resumen: resultado
        });

    } catch (error) {

        console.error("[EC] ERROR CRITICO:", error);

        res.status(500).json({
            ok: false,
            mensaje: "No se pudo actualizar EVENTO_CORPORATIVO.",
            error: error instanceof Error ? error.message : String(error)
        });
    }
}


// ============================================================================
// CONFIG COMPLEMENTARIA
// ============================================================================

const EC_ALPHA_VANTAGE_API_KEY = "RQMZE5MIC1VOPROA";
const EC_AV_MAX_SYMBOLS = Number(process.env.EC_AV_MAX_SYMBOLS || "10");
const EC_FINMIND_TOKEN = "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJ1c2VyX2lkIjoianVhbmdhcjIwMDJAZ21haWwuY29tIiwiZW1haWwiOiJqdWFuZ2FyMjAwMkBnbWFpbC5jb20iLCJ0b2tlbl92ZXJzaW9uIjowfQ.Bhrtve4xNDKxGYLoAv66JQnKRCtm_f_RzMZCmkv82Fk";
const EC_JQUANTS_API_KEY = "9FFCYxn7_cHWGeI7r6PZpxq1KU-t4C47JgTNUoNAJJA";
const EC_JQ_DAYS = Number(process.env.EC_JQ_DAYS || 365);
const EC_JQ_DELAY_DAYS = 0;

function ecFechaEnRango(fecha:string,start:string,end:string):boolean {
    return fecha >= start && fecha <= end;
}

function ecRangoFechasComplementario() {
    const end = new Date();
    const start = new Date();
    start.setUTCDate(start.getUTCDate() - 365 * 4); // 4 años
    return {
        start: start.toISOString().slice(0,10),
        end: end.toISOString().slice(0,10)
    };
}

function ecMapaTicker(instrumentos: InstrumentoEvento[]): Map<string, InstrumentoEvento> {
    const mapa = new Map<string, InstrumentoEvento>();

    for (const inst of instrumentos) {
        const ticker = inst.ticker.trim().toUpperCase();
        if (!ticker) continue;

        mapa.set(ticker, inst);

        const numeric = ticker.replace(/\D/g, "");
        if (numeric.length >= 3) mapa.set(numeric, inst);

        const sinSufijo = ticker
            .replace(/\.TW$/i, "")
            .replace(/\.TWO$/i, "")
            .replace(/\.TPE$/i, "")
            .replace(/\.T$/i, "")
            .replace(/\.JP$/i, "")
            .replace(/\.JQ$/i, "")
            .replace(/\.TSE$/i, "");

        mapa.set(sinSufijo, inst);
    }

    return mapa;
}

function ecArrayDesdeRespuesta(json:any):any[] {
    if (Array.isArray(json)) return json;
    for (const c of [json?.data,json?.bars,json?.daily_quotes,json?.splits,json?.dividends,json?.items]) {
        if (Array.isArray(c)) return c;
    }
    return [];
}

function ecFechaFlexible(...valores:unknown[]):string|null {
    for (const valor of valores) {
        const f = ecFecha(valor);
        if (f) return f;
        if (valor instanceof Date && Number.isFinite(valor.getTime())) return valor.toISOString().slice(0,10);
    }
    return null;
}

// ============================================================================
// USA - ALPHA VANTAGE
// ============================================================================

async function ecFetchAlphaVantage(funcion:"DIVIDENDS"|"SPLITS", ticker:string):Promise<any> {
    if (!EC_ALPHA_VANTAGE_API_KEY) throw new Error("ALPHA_VANTAGE_API_KEY no configurada.");
    const url = `https://www.alphavantage.co/query?function=${funcion}&symbol=${ticker}&apikey=${EC_ALPHA_VANTAGE_API_KEY}`;
    const r = await fetch(url);
    if (!r.ok) throw new Error(`AlphaVantage HTTP ${r.status}`);
    const json = await r.json();
    if (json?.Note || json?.Information || json?.["Error Message"]) throw new Error(String(json?.Note || json?.Information || json?.["Error Message"]));
    return json;
}

async function ecCargarAlphaVantageUSA() {
    if (!EC_ALPHA_VANTAGE_API_KEY) {
        console.log("[EC AV] Sin ALPHA_VANTAGE_API_KEY. Se omite.");
        return {tickers:0,eventos:0,operacionesBD:0};
    }

    const instrumentos = await ecCargarInstrumentosAlpaca();
    const usa = instrumentos.filter(i =>
        ["NASDAQ STOCK MARKET","NEW YORK STOCK EXCHANGE","NYSE AMERICAN"]
        .includes(String(i.mercado||"").toUpperCase())
    );

    const seleccion = usa.slice(0,Math.min(usa.length,EC_AV_MAX_SYMBOLS));
    const rango = ecRangoFechasComplementario();
    const eventos:EventoCorporativoNormalizado[] = [];

    for (const instrumento of seleccion) {
        try {
            const divJson = await ecFetchAlphaVantage("DIVIDENDS",instrumento.ticker);
            for (const d of ecArrayDesdeRespuesta(divJson)) {
                const fecha = ecFechaFlexible(d?.ex_dividend_date,d?.ex_date,d?.date,d?.payment_date,d?.declaration_date);
                if (!fecha || !ecFechaEnRango(fecha,rango.start,rango.end)) continue;
                eventos.push({
                    instrumentoId:instrumento.instrumento_id,
                    tipoEvento:"DIVIDENDO",
                    fecha,
                    valorORatio:ecNumero(d?.amount ?? d?.dividend_amount ?? d?.cash_amount)
                });
            }

            const splitJson = await ecFetchAlphaVantage("SPLITS",instrumento.ticker);
            for (const s of ecArrayDesdeRespuesta(splitJson)) {
                const fecha = ecFechaFlexible(s?.effective_date,s?.ex_date,s?.date);
                if (!fecha || !ecFechaEnRango(fecha,rango.start,rango.end)) continue;
                eventos.push({
                    instrumentoId:instrumento.instrumento_id,
                    tipoEvento:"SPLIT",
                    fecha,
                    valorORatio:ecNumero(s?.split_factor ?? s?.ratio ?? s?.factor)
                });
            }

        } catch (error) {
            console.warn(`[EC AV] ${instrumento.ticker}: ${error instanceof Error ? error.message : String(error)}`);
            const msg = (error instanceof Error ? error.message : String(error)).toLowerCase();
            if (msg.includes("limit") || msg.includes("frequency") || msg.includes("25 requests")) break;
        }
    }

    const operacionesBD = await ecGuardarEventos(eventos);
    console.log(`[EC AV] eventos=${eventos.length} operacionesBD=${operacionesBD}`);
    return {tickers:seleccion.length,eventos:eventos.length,operacionesBD};
}

// ============================================================================
// TAIWAN - TWSE DIVIDENDOS
// ============================================================================

function ecCampo(obj:any,candidatos:string[]):any {
    for (const c of candidatos) {
        if (obj && Object.prototype.hasOwnProperty.call(obj,c)) return obj[c];
    }
    return undefined;
}

async function ecCargarTWSEDividendos() {
    console.log("\n======================================================");
    console.log(" EVENTO_CORPORATIVO - TAIWAN / TWSE");
    console.log("======================================================");

    const instrumentos = await ecCargarInstrumentosAsia();
    const mapa = ecMapaTicker(instrumentos);

    console.log(`[EC TWSE] Instrumentos cargados: ${instrumentos.length}`);
    console.log(`[EC TWSE] Mapa tickers: ${mapa.size}`);

    const url = "https://openapi.twse.com.tw/v1/exchangeReport/TWT48U_ALL";
    const response = await fetch(url, { headers: { Accept: "application/json" } });

    if (!response.ok) {
        throw new Error(`TWSE HTTP ${response.status}`);
    }

    const json = await response.json();
    const filas = Array.isArray(json) ? json : [];

    console.log(`[EC TWSE] Filas recibidas: ${filas.length}`);

    const rango = ecRangoFechas();
    const eventos: EventoCorporativoNormalizado[] = [];

    for (const fila of filas) {
        const ticker = String(fila?.Code || "").trim().toUpperCase();
        if (!ticker) continue;

        const instrumento =
            mapa.get(ticker) ||
            mapa.get(`${ticker}.TW`) ||
            mapa.get(ticker.replace(/\D/g, ""));

        if (!instrumento) {
            console.log(`[EC TWSE] NO CRUZA: ${ticker}`);
            continue;
        }

        const rawFecha = String(fila?.Date || "").trim();
        const match = rawFecha.match(/^(\d{3})(\d{2})(\d{2})$/);

        if (!match) continue;

        const fecha = `${Number(match[1]) + 1911}-${match[2]}-${match[3]}`;
        if (fecha < rango.start || fecha > rango.end) continue;

        const cash = ecNumero(fila?.CashDividend);
        if (cash !== null && cash > 0) {
            eventos.push({
                instrumentoId: instrumento.instrumento_id,
                tipoEvento: "DIVIDENDO",
                fecha,
                valorORatio: cash
            });
        }

        const stock = ecNumero(fila?.StockDividendRatio);
        if (stock !== null && stock > 0) {
            eventos.push({
                instrumentoId: instrumento.instrumento_id,
                tipoEvento: "DIVIDENDO_ACCIONES",
                fecha,
                valorORatio: stock
            });
        }
    }

    const operacionesBD = await ecGuardarEventos(eventos);
    console.log(`[EC TWSE] eventos=${eventos.length} operacionesBD=${operacionesBD}`);

    return { filas: filas.length, eventos: eventos.length, operacionesBD };
}



// ============================================================================
// TAIWAN - FINMIND SPLITS
// ============================================================================

async function ecFetchFinMindEvento(dataset:string):Promise<any[]> {
    const url = `https://api.finmindtrade.com/api/v4/data?dataset=${dataset}`;
    const headers:Record<string,string> = {Accept:"application/json"};
    if (EC_FINMIND_TOKEN) headers.Authorization = `Bearer ${EC_FINMIND_TOKEN}`;

    const r = await fetch(url,{headers});
    if (!r.ok) {
        const body = await r.text();
        throw new Error(`FinMind ${dataset} HTTP ${r.status}: ${body.slice(0,200)}`);
    }

    const json = await r.json();
    if (json?.status && Number(json.status)!==200) {
        throw new Error(`FinMind ${dataset} status ${json.status}: ${json?.msg || ""}`);
    }

    return Array.isArray(json?.data) ? json.data : [];
}

async function ecCargarFinMindSplitsTaiwan() {
    const instrumentos = await ecCargarInstrumentosAsia();
    const mapa = ecMapaTicker(instrumentos);

    const filas = await ecFetchFinMindEvento("TaiwanStockSplitPrice");
    const rango = ecRangoFechas();
    const eventos: EventoCorporativoNormalizado[] = [];

    for (const fila of filas) {
        const ticker = String(fila?.stock_id || "").trim().toUpperCase();
        const instrumento = mapa.get(ticker) || mapa.get(ticker.replace(/\D/g, ""));

        if (!instrumento) {
            console.log(`NO CRUZA FINMIND: ${ticker}`);
            continue;
        }

        const fecha = ecFechaFlexible(fila?.date);
        if (!fecha || fecha < rango.start || fecha > rango.end) continue;

        const before = ecNumero(fila?.before_price);
        const after = ecNumero(fila?.after_price);

        if (before !== null && after !== null && after !== 0) {
            eventos.push({
                instrumentoId: instrumento.instrumento_id,
                tipoEvento: "SPLIT",
                fecha,
                valorORatio: before / after
            });
        }
    }

    const operacionesBD = await ecGuardarEventos(eventos);
    console.log(`[EC FINMIND] eventos=${eventos.length} operacionesBD=${operacionesBD}`);

    return { filas: filas.length, eventos: eventos.length, operacionesBD };
}


// ============================================================================
// JAPON - JQUANTS SPLITS
// ============================================================================

function ecFechaMenosDias(dias:number):string {
    const d = new Date();
    d.setUTCDate(d.getUTCDate()-dias);
    return d.toISOString().slice(0,10);
}

function ecFormatoJQ(fecha:string):string {
    return fecha.replace(/-/g,"");
}

async function ecFetchJQuantsDia(fecha:string):Promise<any[]> {
    if (!EC_JQUANTS_API_KEY) return [];
    const url = `https://api.jquants.com/v2/equities/bars/daily?date=${ecFormatoJQ(fecha)}`;
    const r = await fetch(url,{headers:{"x-api-key":EC_JQUANTS_API_KEY,Accept:"application/json"}});
    if (!r.ok) {
        const body = await r.text();
        throw new Error(`J-Quants HTTP ${r.status}: ${body.slice(0,200)}`);
    }
    return ecArrayDesdeRespuesta(await r.json());
}

async function ecCargarJQuantsSplitsJapon() {

    console.log(
        "[JP DEBUG] API KEY cargada:",
        Boolean(EC_JQUANTS_API_KEY)
    );

    if (!EC_JQUANTS_API_KEY) {
        console.log("[EC JQ] Sin API KEY");
        return {
            dias: 0,
            filas: 0,
            eventos: 0,
            operacionesBD: 0
        };
    }

    const instrumentos = await ecCargarInstrumentosAsia();
    const mapa = ecMapaTicker(instrumentos);

    console.log(
        "[JP DEBUG] instrumentos Asia:",
        instrumentos.length
    );

    console.log(
        "[JP DEBUG] mapa ticker:",
        mapa.size
    );

    const fin = ecFechaMenosDias(EC_JQ_DELAY_DAYS);
    const finDate = new Date(`${fin}T00:00:00Z`);

    const inicioDate = new Date(finDate.getTime());

    inicioDate.setUTCDate(
        inicioDate.getUTCDate() - EC_JQ_DAYS
    );

    console.log(
        "[JP DEBUG] rango:",
        inicioDate.toISOString().slice(0,10),
        "->",
        finDate.toISOString().slice(0,10)
    );

    const eventos: EventoCorporativoNormalizado[] = [];

    let dias = 0;
    let filasTotal = 0;

    let factoresDistintosDeUno = 0;
    let sinInstrumento = 0;

    let primeraFilaMostrada = false;

    for (
        let d = new Date(inicioDate);
        d <= finDate;
        d.setUTCDate(d.getUTCDate() + 1)
    ) {

        const fecha =
            d.toISOString().slice(0, 10);

        try {

            const filas =
                await ecFetchJQuantsDia(fecha);

            dias++;
            filasTotal += filas.length;

            if (
                filas.length > 0 &&
                !primeraFilaMostrada
            ) {

                console.log(
                    "[JP DEBUG] primer dÃ­a con datos:",
                    fecha
                );

                console.log(
                    "[JP DEBUG] filas recibidas:",
                    filas.length
                );

                console.log(
                    "[JP DEBUG] primera fila:",
                    filas[0]
                );

                console.log(
                    "[JP DEBUG] claves primera fila:",
                    Object.keys(filas[0])
                );

                primeraFilaMostrada = true;
            }

            for (const fila of filas) {

                const codigo =
                    String(
                        fila?.Code ||
                        fila?.LocalCode ||
                        ""
                    )
                    .trim()
                    .toUpperCase();

                const instrumento =
                    mapa.get(codigo) ||
                    mapa.get(
                        codigo.replace(/\D/g, "")
                    );

                if (!instrumento) {

                    sinInstrumento++;

                    if (sinInstrumento <= 20) {
                        console.log(
                            "[JP DEBUG] NO CRUZA:",
                            codigo
                        );
                    }

                    continue;
                }

                const factor =
                    ecNumero(
                        fila?.AdjustmentFactor
                    );

                if (
                    factor &&
                    factor !== 1
                ) {

                    factoresDistintosDeUno++;

                    console.log(
                        "[JP DEBUG] SPLIT DETECTADO:",
                        {
                            codigo,
                            fecha,
                            factor,
                            ratio:
                                1 / factor,
                            instrumentoId:
                                instrumento.instrumento_id
                        }
                    );
                }

                if (
                    !factor ||
                    factor === 1
                ) {
                    continue;
                }

                eventos.push({
                    instrumentoId:
                        instrumento.instrumento_id,

                    tipoEvento:
                        "SPLIT",

                    fecha,

                    valorORatio:
                        1 / factor
                });
            }

        } catch (error) {

            console.warn(
                `[EC JQ] ${fecha}: ${error}`
            );
        }

        await new Promise(
            r =>
                setTimeout(
                    r,
                    5000
                )
        );
    }

    console.log(
        "[JP DEBUG] dias consultados:",
        dias
    );

    console.log(
        "[JP DEBUG] filas totales:",
        filasTotal);

    console.log("[JP DEBUG] sin instrumento:", sinInstrumento);

    console.log(
        "[JP DEBUG] AdjustmentFactor != 1:", factoresDistintosDeUno);

    console.log(
        "[JP DEBUG] eventos preparados:", eventos.length);

    console.log("[JP DEBUG] primeros eventos:", eventos.slice(0,10));

    const operacionesBD = await ecGuardarEventos(eventos);

    console.log(`[EC JQ] eventos=${eventos.length} operacionesBD=${operacionesBD}`);
    return {
        dias,
        filas: filasTotal,
        eventos: eventos.length,
        operacionesBD
    };
}



// ============================================================================
// MOTOR COMPLEMENTARIO
// ============================================================================

export async function ejecutarCargaEventoCorporativoComplementario() {
    const twse = await ecCargarTWSEDividendos();
    const finmind = await ecCargarFinMindSplitsTaiwan();
    const jquants = await ecCargarJQuantsSplitsJapon();

    return {
        twse,
        finmind,
        jquants
    };
}



export async function actualizarEventoCorporativoComplementario(_req:Request,res:Response):Promise<void> {
    try {
        const resultado = await ejecutarCargaEventoCorporativoComplementario();
        res.status(200).json({
            ok:true,
            mensaje:"Fuentes complementarias EVENTO_CORPORATIVO actualizadas.",
            resumen:resultado
        });
    } catch (error) {
        res.status(500).json({
            ok:false,
            mensaje:"No se pudieron actualizar las fuentes complementarias.",
            error:error instanceof Error ? error.message : String(error)
        });
    }
}

// ============================================================================
// EJECUCIÓN DIRECTA
// ============================================================================

async function main() {
    console.log("MAIN INICIADO");

    const resumenAlpaca = await ejecutarCargaEventoCorporativo();
    const resumenComplementario = await ejecutarCargaEventoCorporativoComplementario();

    console.log("RESUMEN ALPACA:", resumenAlpaca);
    console.log("RESUMEN COMPLEMENTARIO:", resumenComplementario);
}


main();
