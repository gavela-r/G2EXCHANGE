import { Request, Response } from "express";
import conexion from "../conexion/bd";

// ============================================================================
// COTIZACION_DIARIA - USA + TAIWAN
//
// USA - Estrategia gratuita y escalonada:
// 1) Alpaca Basic / IEX: motor principal, multi-symbol en batches.
// 2) Finnhub: fallback para símbolos no resueltos por Alpaca.
// 3) Twelve Data: fallback final limitado por créditos gratuitos.
//
// TAIWAN - Estrategia:
// 1) Yahoo Finance (v8/chart): sin API key. TWSE -> ticker.TW, TPEx -> ticker.TWO
// 2) Fuente oficial de cierre: TWSE Open Data / TPEx OpenAPI (fallback)
//
// IMPORTANTE:
// - La tabla solo guarda: instrumento_id, fecha, precio_cierre.
// - Durante la sesión, precio_cierre representa el último precio disponible.
// - La fecha se toma del timestamp de la fuente cuando existe, en horario local.
// - Un único registro por instrumento y fecha: se hace UPSERT.
// ============================================================================

type ProveedorUSA = "ALPACA" | "FINNHUB" | "TWELVE_DATA";
type ProveedorTaiwan = "YAHOO" | "TWSE" | "TPEX";
type ProveedorJapon = "YAHOO" | "TWELVE_DATA";

interface InstrumentoUSA {
    id: number;
    ticker: string;
    mercado: string;
}

interface InstrumentoTaiwan {
    id: number;
    ticker: string;
    mercado: "TAIWAN STOCK EXCHANGE" | "TAIPEI EXCHANGE";
}

interface InstrumentoJapon {
    id: number;
    ticker: string;
}

interface PrecioResueltoUSA {
    instrumentoId: number;
    ticker: string;
    precio: number;
    fecha: string;
    proveedor: ProveedorUSA;
}

interface PrecioResueltoTaiwan {
    instrumentoId: number;
    ticker: string;
    precio: number;
    fecha: string;
    proveedor: ProveedorTaiwan;
}

interface PrecioResueltoJapon {
    instrumentoId: number;
    ticker: string;
    precio: number;
    fecha: string;
    proveedor: ProveedorJapon;
}

interface ResultadoProveedorJapon {
    resueltos: PrecioResueltoJapon[];
    pendientes: InstrumentoJapon[];
}

interface EstadisticasProveedor {
    intentados: number;
    resueltos: number;
    fallos: number;
    duracionMs: number;
}

interface ResumenEjecucionUSA {
    totalInstrumentos: number;
    alpaca: EstadisticasProveedor;
    finnhub: EstadisticasProveedor;
    twelveData: EstadisticasProveedor;
    totalResueltos: number;
    totalSinResolver: number;
    totalUpserts: number;
    duracionTotalMs: number;
}

interface ResumenEjecucionTaiwan {
    totalInstrumentos: number;
    yahoo: number;
    oficialTwseTpex: number;
    totalResueltos: number;
    totalSinResolver: number;
    totalUpserts: number;
    duracionTotalMs: number;
}

interface ResumenEjecucionJapon {
    totalInstrumentos: number;
    yahoo: number;
    twelveData: number;
    totalResueltos: number;
    totalSinResolver: number;
    totalUpserts: number;
    duracionTotalMs: number;
}

// ============================================================================
// CONFIGURACIÓN COMÚN
// ============================================================================

const HTTP_TIMEOUT_MS = Number(process.env.MARKET_HTTP_TIMEOUT_MS || 12000);
const RETRIES = Number(process.env.MARKET_API_RETRIES || 2);

// ============================================================================
// CONFIGURACIÓN USA
// ============================================================================

const ALPACA_KEY = "PKYCO53R524KFTZ3OYYTWRRSC2";
const ALPACA_SECRET = "AS5x5THDykUJyBF1y38EK6vem8BVrA8wmzmxuvdA5dto";
const FINNHUB_KEY = "d9lut01r01qhk6k6au20d9lut01r01qhk6k6au2g";
const TWELVE_DATA_KEY = "4b052a77312b40be8c21e9663c0d0d60";

// Batch conservador para no acercarnos a límites de longitud de URL.
const ALPACA_BATCH_SIZE = Number(process.env.ALPACA_BATCH_SIZE || 200);

// Finnhub free: 60 llamadas/min. Dejamos margen operativo.
const FINNHUB_CALLS_PER_MINUTE = Number(
    process.env.FINNHUB_CALLS_PER_MINUTE || 55
);

// Twelve Data free: 8 créditos/minuto y 800/día.
// Por seguridad no gastamos los 800 en una sola ejecución salvo que se configure.
const TWELVE_CALLS_PER_MINUTE = Number(
    process.env.TWELVE_CALLS_PER_MINUTE || 8
);
const TWELVE_MAX_PER_RUN = Number(
    process.env.TWELVE_MAX_PER_RUN || 160
);

// Mercados USA según los nombres actuales de la tabla MERCADO.
// Añadir aquí cualquier nuevo mercado USA que se cree en la BD.
const MERCADOS_USA = [
    "NASDAQ STOCK MARKET",
    "NEW YORK STOCK EXCHANGE",
    "NYSE AMERICAN"
];

// ============================================================================
// CONFIGURACIÓN TAIWAN
// ============================================================================

const YAHOO_CONCURRENCY = Number(process.env.YAHOO_TW_CONCURRENCY || 12);

// ============================================================================
// CONFIGURACIÓN JAPON
// ============================================================================

const YAHOO_JP_CONCURRENCY = Number(process.env.YAHOO_JP_CONCURRENCY || 12);

// Twelve Data es opcional para Japón: solo se usa si hay API key configurada.
const TWELVE_DATA_JP_KEY = process.env.TWELVE_DATA_API_KEY || "";
const TWELVE_JP_RPM = Number(process.env.TWELVE_RPM || 7);
const TWELVE_JP_MAX_PER_RUN = Number(process.env.TWELVE_MAX_PER_RUN || 100);

// ============================================================================
// UTILIDADES COMUNES
// ============================================================================

function dormir(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function dividirEnLotes<T>(datos: T[], tamano: number): T[][] {
    const lotes: T[][] = [];
    for (let i = 0; i < datos.length; i += tamano) {
        lotes.push(datos.slice(i, i + tamano));
    }
    return lotes;
}

function numeroValido(valor: unknown): number | null {
    const n = Number(valor);
    return Number.isFinite(n) && n > 0 ? n : null;
}

function numeroValidoConLimpieza(valor: unknown): number | null {
    if (valor === null || valor === undefined || valor === "" || valor === "--") {
        return null;
    }
    const limpio = String(valor).replace(/,/g, "").trim();
    return numeroValido(limpio);
}

async function fetchJsonConRetry(
    url: string,
    init?: RequestInit,
    retries = RETRIES
): Promise<any> {
    let ultimoError: unknown;

    for (let intento = 0; intento <= retries; intento++) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), HTTP_TIMEOUT_MS);

        try {
            const res = await fetch(url, {
                ...init,
                signal: controller.signal
            });

            clearTimeout(timer);

            if (res.status === 429) {
                const retryAfter = Number(res.headers.get("retry-after") || 0);
                const espera = retryAfter > 0
                    ? retryAfter * 1000
                    : Math.min(2000 * Math.pow(2, intento), 15000);

                if (intento < retries) {
                    await dormir(espera);
                    continue;
                }
            }

            if (!res.ok) {
                throw new Error(`HTTP ${res.status} - ${await res.text()}`);
            }

            return await res.json();
        } catch (error) {
            clearTimeout(timer);
            ultimoError = error;
            if (intento < retries) {
                await dormir(Math.min(1000 * Math.pow(2, intento), 5000));
            }
        }
    }

    throw ultimoError instanceof Error
        ? ultimoError
        : new Error(String(ultimoError));
}

function crearStats(): EstadisticasProveedor {
    return {
        intentados: 0,
        resueltos: 0,
        fallos: 0,
        duracionMs: 0
    };
}

// Pool de concurrencia simple, usado por la fase Yahoo de Taiwán.
async function mapConConcurrencia<T, R>(
    datos: T[],
    concurrencia: number,
    funcion: (dato: T) => Promise<R>
): Promise<R[]> {
    const resultados: R[] = new Array(datos.length);
    let indice = 0;

    async function worker() {
        while (true) {
            const actual = indice++;
            if (actual >= datos.length) return;
            resultados[actual] = await funcion(datos[actual]);
        }
    }

    const workers = Array.from(
        { length: Math.min(concurrencia, Math.max(datos.length, 1)) },
        () => worker()
    );

    await Promise.all(workers);
    return resultados;
}

// ============================================================================
// UTILIDADES DE FECHA - USA (horario Nueva York)
// ============================================================================

function fechaNuevaYorkDesdeDate(fecha: Date): string {
    // en-CA devuelve YYYY-MM-DD en Node moderno.
    return new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/New_York",
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
    }).format(fecha);
}

function fechaNuevaYorkDesdeTimestampMs(timestampMs: number): string {
    return fechaNuevaYorkDesdeDate(new Date(timestampMs));
}

function fechaNuevaYorkDesdeIso(iso: string | undefined): string {
    if (!iso) return fechaNuevaYorkDesdeDate(new Date());
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return fechaNuevaYorkDesdeDate(new Date());
    return fechaNuevaYorkDesdeDate(d);
}

// ============================================================================
// UTILIDADES DE FECHA - TAIWAN (horario Taipei)
// ============================================================================

function fechaTaiwanDesdeDate(fecha: Date): string {
    return new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Taipei",
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
    }).format(fecha);
}

function fechaTaiwanDesdeTimestamp(timestampSegundos: number | null): string {
    if (!timestampSegundos || timestampSegundos <= 0) {
        return fechaTaiwanDesdeDate(new Date());
    }
    return fechaTaiwanDesdeDate(new Date(timestampSegundos * 1000));
}

// ============================================================================
// UTILIDADES DE FECHA - JAPON (horario Tokio)
// ============================================================================

function fechaTokioDesdeDate(fecha: Date): string {
    return new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Tokyo",
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
    }).format(fecha);
}

function fechaTokioDesdeTimestamp(timestampSegundos: number | null): string {
    if (!timestampSegundos || timestampSegundos <= 0) {
        return fechaTokioDesdeDate(new Date());
    }
    return fechaTokioDesdeDate(new Date(timestampSegundos * 1000));
}

// ============================================================================
// BD: INSTRUMENTOS USA
// ============================================================================

async function cargarInstrumentosUSA(): Promise<InstrumentoUSA[]> {
    const placeholders = MERCADOS_USA.map(() => "?").join(",");

    const [rows]: any = await (conexion as any).query(
        `
        SELECT
            i.id,
            i.ticker,
            m.nombre_bolsa AS mercado
        FROM instrumento i
        INNER JOIN mercado m
            ON m.id = i.mercado_id
        WHERE UPPER(m.nombre_bolsa) IN (${placeholders})
          AND i.ticker IS NOT NULL
          AND TRIM(i.ticker) <> ''
        ORDER BY i.id
        `,
        MERCADOS_USA
    );

    return rows.map((r: any) => ({
        id: Number(r.id),
        ticker: String(r.ticker).trim().toUpperCase(),
        mercado: String(r.mercado)
    }));
}

// ============================================================================
// BD: INSTRUMENTOS TAIWAN
// ============================================================================

async function cargarInstrumentosTaiwan(): Promise<InstrumentoTaiwan[]> {
    const [rows]: any = await (conexion as any).query(
        `
        SELECT
            i.id,
            i.ticker,
            m.nombre_bolsa AS mercado
        FROM instrumento i
        INNER JOIN mercado m
            ON m.id = i.mercado_id
        WHERE UPPER(m.nombre_bolsa) IN ('TAIWAN STOCK EXCHANGE', 'TAIPEI EXCHANGE')
          AND i.ticker IS NOT NULL
          AND TRIM(i.ticker) <> ''
        ORDER BY i.id
        `
    );

    return rows.map((r: any) => ({
        id: Number(r.id),
        ticker: String(r.ticker).trim().toUpperCase(),
        mercado: String(r.mercado).toUpperCase()
    }));
}

// ============================================================================
// BD: INSTRUMENTOS JAPON
// ============================================================================

async function cargarInstrumentosJapon(): Promise<InstrumentoJapon[]> {
    const [rows]: any = await (conexion as any).query(
        `
        SELECT DISTINCT
            i.id,
            i.ticker
        FROM instrumento i
        INNER JOIN mercado m
            ON m.id = i.mercado_id
        WHERE UPPER(m.nombre_bolsa) = 'TOKYO STOCK EXCHANGE'
          AND i.ticker IS NOT NULL
          AND TRIM(i.ticker) <> ''
        ORDER BY i.id
        `
    );

    return rows.map((r: any) => ({
        id: Number(r.id),
        ticker: String(r.ticker).trim().toUpperCase()
    }));
}

// ============================================================================
// USA - PROVEEDOR 1: ALPACA - MOTOR PRINCIPAL
// Endpoint multi-symbol:
// GET https://data.alpaca.markets/v2/stocks/trades/latest?symbols=AAPL,MSFT&feed=iex
// ============================================================================

async function resolverConAlpaca(
    instrumentos: InstrumentoUSA[],
    stats: EstadisticasProveedor
): Promise<Map<number, PrecioResueltoUSA>> {
    const inicio = Date.now();
    const resultados = new Map<number, PrecioResueltoUSA>();

    if (!ALPACA_KEY || !ALPACA_SECRET) {
        console.log("[ALPACA] Sin credenciales. Se omite proveedor.");
        stats.fallos = instrumentos.length;
        stats.duracionMs = Date.now() - inicio;
        return resultados;
    }

    const lotes = dividirEnLotes(instrumentos, ALPACA_BATCH_SIZE);
    stats.intentados = instrumentos.length;

    // 53 batches aprox. para 10.432 instrumentos si batch=200.
    // Los procesamos con concurrencia moderada para evitar picos innecesarios.
    const CONCURRENCIA = 8;

    for (let i = 0; i < lotes.length; i += CONCURRENCIA) {
        const grupo = lotes.slice(i, i + CONCURRENCIA);

        const respuestas = await Promise.all(
            grupo.map(async lote => {
                const porTicker = new Map(lote.map(x => [x.ticker, x]));
                const symbols = lote.map(x => x.ticker).join(",");
                const url =
                    `https://data.alpaca.markets/v2/stocks/trades/latest` +
                    `?symbols=${encodeURIComponent(symbols)}&feed=iex`;

                try {
                    const json = await fetchJsonConRetry(url, {
                        headers: {
                            "APCA-API-KEY-ID": ALPACA_KEY,
                            "APCA-API-SECRET-KEY": ALPACA_SECRET
                        }
                    });

                    const trades = json?.trades || {};

                    for (const [ticker, trade] of Object.entries<any>(trades)) {
                        const instrumento = porTicker.get(ticker.toUpperCase());
                        if (!instrumento) continue;

                        const precio = numeroValido(trade?.p);
                        if (precio === null) continue;

                        resultados.set(instrumento.id, {
                            instrumentoId: instrumento.id,
                            ticker: instrumento.ticker,
                            precio,
                            fecha: fechaNuevaYorkDesdeIso(trade?.t),
                            proveedor: "ALPACA"
                        });
                    }
                } catch (error) {
                    console.error(
                        `[ALPACA] Error batch ${lote[0]?.ticker}... (${lote.length}):`,
                        error instanceof Error ? error.message : error
                    );
                }
            })
        );

        void respuestas;
    }

    stats.resueltos = resultados.size;
    stats.fallos = stats.intentados - stats.resueltos;
    stats.duracionMs = Date.now() - inicio;

    return resultados;
}

// ============================================================================
// USA - PROVEEDOR 2: FINNHUB - FALLBACK
// Free: 60 llamadas/min. Quote es 1 ticker por llamada.
// GET https://finnhub.io/api/v1/quote?symbol=AAPL&token=KEY
// ============================================================================

async function resolverConFinnhub(
    instrumentos: InstrumentoUSA[],
    stats: EstadisticasProveedor
): Promise<Map<number, PrecioResueltoUSA>> {
    const inicio = Date.now();
    const resultados = new Map<number, PrecioResueltoUSA>();

    if (!FINNHUB_KEY || instrumentos.length === 0) {
        if (!FINNHUB_KEY) {
            console.warn("[FINNHUB] Sin API key. Se omite proveedor.");
        }
        stats.intentados = instrumentos.length;
        stats.fallos = instrumentos.length;
        stats.duracionMs = Date.now() - inicio;
        return resultados;
    }

    stats.intentados = instrumentos.length;
    const lotesMinuto = dividirEnLotes(instrumentos, FINNHUB_CALLS_PER_MINUTE);

    for (let bloque = 0; bloque < lotesMinuto.length; bloque++) {
        const lote = lotesMinuto[bloque];
        const inicioBloque = Date.now();

        await Promise.all(
            lote.map(async instrumento => {
                const url =
                    `https://finnhub.io/api/v1/quote` +
                    `?symbol=${encodeURIComponent(instrumento.ticker)}` +
                    `&token=${encodeURIComponent(FINNHUB_KEY)}`;

                try {
                    const json = await fetchJsonConRetry(url);
                    const precio = numeroValido(json?.c);
                    if (precio === null) return;

                    const tsMs = Number(json?.t) > 0
                        ? Number(json.t) * 1000
                        : Date.now();

                    resultados.set(instrumento.id, {
                        instrumentoId: instrumento.id,
                        ticker: instrumento.ticker,
                        precio,
                        fecha: fechaNuevaYorkDesdeTimestampMs(tsMs),
                        proveedor: "FINNHUB"
                    });
                } catch (error) {
                    console.error(
                        `[FINNHUB] ${instrumento.ticker}:`,
                        error instanceof Error ? error.message : error
                    );
                }
            })
        );

        // Esperamos hasta completar ~60 s antes del siguiente bloque,
        // salvo que este sea el último.
        if (bloque < lotesMinuto.length - 1) {
            const transcurrido = Date.now() - inicioBloque;
            const espera = Math.max(0, 61000 - transcurrido);
            if (espera > 0) await dormir(espera);
        }
    }

    stats.resueltos = resultados.size;
    stats.fallos = stats.intentados - stats.resueltos;
    stats.duracionMs = Date.now() - inicio;
    return resultados;
}

// ============================================================================
// USA - PROVEEDOR 3: TWELVE DATA - FALLBACK FINAL
// Free: 8 créditos/min y 800/día. Cada símbolo consume 1 crédito.
// Usamos /quote porque devuelve close + timestamp.
// ============================================================================

async function resolverConTwelveData(
    instrumentos: InstrumentoUSA[],
    stats: EstadisticasProveedor
): Promise<Map<number, PrecioResueltoUSA>> {
    const inicio = Date.now();
    const resultados = new Map<number, PrecioResueltoUSA>();

    const candidatos = instrumentos.slice(0, TWELVE_MAX_PER_RUN);
    stats.intentados = candidatos.length;

    if (!TWELVE_DATA_KEY || candidatos.length === 0) {
        if (!TWELVE_DATA_KEY) {
            console.warn("[TWELVE DATA] Sin API key. Se omite proveedor.");
        }
        stats.fallos = candidatos.length;
        stats.duracionMs = Date.now() - inicio;
        return resultados;
    }

    const lotesMinuto = dividirEnLotes(candidatos, TWELVE_CALLS_PER_MINUTE);

    for (let bloque = 0; bloque < lotesMinuto.length; bloque++) {
        const lote = lotesMinuto[bloque];
        const inicioBloque = Date.now();

        await Promise.all(
            lote.map(async instrumento => {
                const url =
                    `https://api.twelvedata.com/quote` +
                    `?symbol=${encodeURIComponent(instrumento.ticker)}` +
                    `&apikey=${encodeURIComponent(TWELVE_DATA_KEY)}`;

                try {
                    const json = await fetchJsonConRetry(url);
                    if (json?.status === "error" || json?.code) return;

                    const precio = numeroValido(json?.close);
                    if (precio === null) return;

                    const tsMs = Number(json?.timestamp) > 0
                        ? Number(json.timestamp) * 1000
                        : Date.now();

                    resultados.set(instrumento.id, {
                        instrumentoId: instrumento.id,
                        ticker: instrumento.ticker,
                        precio,
                        fecha: fechaNuevaYorkDesdeTimestampMs(tsMs),
                        proveedor: "TWELVE_DATA"
                    });
                } catch (error) {
                    console.error(
                        `[TWELVE DATA] ${instrumento.ticker}:`,
                        error instanceof Error ? error.message : error
                    );
                }
            })
        );

        if (bloque < lotesMinuto.length - 1) {
            const transcurrido = Date.now() - inicioBloque;
            const espera = Math.max(0, 61000 - transcurrido);
            if (espera > 0) await dormir(espera);
        }
    }

    stats.resueltos = resultados.size;
    stats.fallos = stats.intentados - stats.resueltos;
    stats.duracionMs = Date.now() - inicio;
    return resultados;
}

// ============================================================================
// TAIWAN - PROVEEDOR 1: YAHOO FINANCE - MOTOR PRINCIPAL
// GET https://query1.finance.yahoo.com/v8/finance/chart/2330.TW
// ============================================================================

function construirTickerYahoo(instrumento: InstrumentoTaiwan): string {
    return instrumento.mercado === "TAIWAN STOCK EXCHANGE"
        ? `${instrumento.ticker}.TW`
        : `${instrumento.ticker}.TWO`;
}

async function resolverYahoo(
    instrumento: InstrumentoTaiwan
): Promise<PrecioResueltoTaiwan | null> {
    const yahooTicker = construirTickerYahoo(instrumento);
    const url =
        `https://query1.finance.yahoo.com/v8/finance/chart/` +
        `${encodeURIComponent(yahooTicker)}?interval=1m&range=1d`;

    try {
        const json = await fetchJsonConRetry(url, {
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
                "Accept": "application/json,text/plain,*/*"
            }
        });

        const resultado = json?.chart?.result?.[0];
        if (!resultado) return null;

        // Opción 1: precio actual indicado por Yahoo.
        let precio = numeroValidoConLimpieza(resultado?.meta?.regularMarketPrice);
        let timestamp = Number(resultado?.meta?.regularMarketTime) || null;

        // Opción 2: última vela intradía válida.
        if (precio === null) {
            const timestamps: number[] = resultado?.timestamp || [];
            const cierres: any[] = resultado?.indicators?.quote?.[0]?.close || [];

            for (let i = cierres.length - 1; i >= 0; i--) {
                const candidato = numeroValidoConLimpieza(cierres[i]);
                if (candidato !== null) {
                    precio = candidato;
                    timestamp = timestamps[i] || timestamp;
                    break;
                }
            }
        }

        if (precio === null) return null;

        return {
            instrumentoId: instrumento.id,
            ticker: instrumento.ticker,
            precio,
            fecha: fechaTaiwanDesdeTimestamp(timestamp),
            proveedor: "YAHOO"
        };
    } catch {
        return null;
    }
}

// ============================================================================
// TAIWAN - PROVEEDOR 2: TWSE OFICIAL - FALLBACK
// ============================================================================

async function descargarCierresTWSE(): Promise<Map<string, number>> {
    const mapa = new Map<string, number>();

    const urls = [
        "https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL",
        "https://www.twse.com.tw/exchangeReport/STOCK_DAY_ALL?response=json"
    ];

    for (const url of urls) {
        try {
            const json = await fetchJsonConRetry(url, {
                headers: {
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
                    "Accept": "application/json,text/plain,*/*"
                }
            });

            const filas = Array.isArray(json) ? json : json?.data;
            if (!Array.isArray(filas)) continue;

            for (const fila of filas) {
                if (!Array.isArray(fila)) {
                    const ticker = String(fila.Code || fila.code || "").trim().toUpperCase();
                    const precio = numeroValidoConLimpieza(
                        fila.ClosingPrice ?? fila.closingPrice ?? fila.Close ?? fila.close
                    );

                    if (ticker && precio !== null) {
                        mapa.set(ticker, precio);
                    }
                    continue;
                }

                // Respuesta alternativa en formato array: [codigo, nombre, ..., close, ...]
                const ticker = String(fila[0] || "").trim().toUpperCase();
                const posibles = fila.slice(2);
                let precio: number | null = null;

                for (let i = posibles.length - 1; i >= 0; i--) {
                    const n = numeroValidoConLimpieza(posibles[i]);
                    if (n !== null) {
                        precio = n;
                        break;
                    }
                }

                if (ticker && precio !== null) {
                    mapa.set(ticker, precio);
                }
            }

            if (mapa.size > 0) {
                console.log(`[TWSE] Cierres oficiales: ${mapa.size}`);
                return mapa;
            }
        } catch (error) {
            console.warn(`[TWSE] Endpoint no disponible: ${url}`);
        }
    }

    return mapa;
}

// ============================================================================
// TAIWAN - PROVEEDOR 3: TPEX OFICIAL - FALLBACK
// ============================================================================

async function descargarCierresTPEX(): Promise<Map<string, number>> {
    const mapa = new Map<string, number>();

    const urls = [
        "https://www.tpex.org.tw/openapi/v1/tpex_mainboard_daily_close_quotes",
        "https://www.tpex.org.tw/openapi/v1/tpex_mainboard_quotes"
    ];

    for (const url of urls) {
        try {
            const json = await fetchJsonConRetry(url, {
                headers: {
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
                    "Accept": "application/json,text/plain,*/*"
                }
            });

            if (!Array.isArray(json)) continue;

            for (const fila of json) {
                const ticker = String(
                    fila.SecuritiesCompanyCode ?? fila.Code ?? fila.code ?? fila.StockCode ?? ""
                ).trim().toUpperCase();

                const precio = numeroValidoConLimpieza(
                    fila.Close ?? fila.ClosePrice ?? fila.ClosingPrice ?? fila.close ?? fila.close_price
                );

                if (ticker && precio !== null) {
                    mapa.set(ticker, precio);
                }
            }

            if (mapa.size > 0) {
                console.log(`[TPEX] Cierres oficiales: ${mapa.size}`);
                return mapa;
            }
        } catch (error) {
            console.warn(`[TPEX] Endpoint no disponible: ${url}`);
        }
    }

    return mapa;
}

async function resolverConCierreOficial(
    instrumentos: InstrumentoTaiwan[]
): Promise<Map<number, PrecioResueltoTaiwan>> {
    const resultados = new Map<number, PrecioResueltoTaiwan>();

    const [mapaTWSE, mapaTPEX] = await Promise.all([
        descargarCierresTWSE(),
        descargarCierresTPEX()
    ]);

    const fecha = fechaTaiwanDesdeDate(new Date());

    for (const instrumento of instrumentos) {
        const esTWSE = instrumento.mercado === "TAIWAN STOCK EXCHANGE";
        const precio = esTWSE
            ? mapaTWSE.get(instrumento.ticker) || null
            : mapaTPEX.get(instrumento.ticker) || null;

        if (precio === null) continue;

        resultados.set(instrumento.id, {
            instrumentoId: instrumento.id,
            ticker: instrumento.ticker,
            precio,
            fecha,
            proveedor: esTWSE ? "TWSE" : "TPEX"
        });
    }

    return resultados;
}

// ============================================================================
// JAPON - PROVEEDOR 1: YAHOO FINANCE - MOTOR PRINCIPAL
// GET https://query1.finance.yahoo.com/v8/finance/chart/7203.T
// ============================================================================

function tickerYahooJapon(ticker: string): string {
    const limpio = ticker.trim().toUpperCase();
    return limpio.endsWith(".T") ? limpio : `${limpio}.T`;
}

async function resolverYahooJapon(
    instrumento: InstrumentoJapon
): Promise<PrecioResueltoJapon | null> {
    const yahooTicker = tickerYahooJapon(instrumento.ticker);
    const url =
        `https://query1.finance.yahoo.com/v8/finance/chart/` +
        `${encodeURIComponent(yahooTicker)}?interval=1m&range=1d`;

    try {
        const json = await fetchJsonConRetry(url, {
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
                "Accept": "application/json,text/plain,*/*"
            }
        });

        const resultado = json?.chart?.result?.[0];
        if (!resultado) return null;

        // Opción 1: precio actual indicado por Yahoo.
        let precio = numeroValidoConLimpieza(resultado?.meta?.regularMarketPrice);
        let timestamp = Number(resultado?.meta?.regularMarketTime) || null;

        // Opción 2: última vela intradía válida.
        if (precio === null) {
            const timestamps: number[] = resultado?.timestamp || [];
            const cierres: any[] = resultado?.indicators?.quote?.[0]?.close || [];

            for (let i = cierres.length - 1; i >= 0; i--) {
                const candidato = numeroValidoConLimpieza(cierres[i]);
                if (candidato !== null) {
                    precio = candidato;
                    timestamp = timestamps[i] || timestamp;
                    break;
                }
            }
        }

        if (precio === null) return null;

        return {
            instrumentoId: instrumento.id,
            ticker: instrumento.ticker,
            precio,
            fecha: fechaTokioDesdeTimestamp(timestamp),
            proveedor: "YAHOO"
        };
    } catch {
        return null;
    }
}

async function ejecutarYahooJapon(
    instrumentos: InstrumentoJapon[]
): Promise<ResultadoProveedorJapon> {
    const resultados = await mapConConcurrencia(
        instrumentos,
        YAHOO_JP_CONCURRENCY,
        resolverYahooJapon
    );

    const resueltos: PrecioResueltoJapon[] = [];
    const resueltosIds = new Set<number>();

    for (const resultado of resultados) {
        if (resultado) {
            resueltos.push(resultado);
            resueltosIds.add(resultado.instrumentoId);
        }
    }

    const pendientes = instrumentos.filter(i => !resueltosIds.has(i.id));

    return { resueltos, pendientes };
}

// ============================================================================
// JAPON - PROVEEDOR 2: TWELVE DATA - FALLBACK (opcional, requiere API key)
// GET https://api.twelvedata.com/price?symbol=7203&exchange=XJPX&apikey=KEY
// ============================================================================

async function resolverTwelveDataJapon(
    instrumento: InstrumentoJapon
): Promise<PrecioResueltoJapon | null> {
    if (!TWELVE_DATA_JP_KEY) return null;

    const url =
        `https://api.twelvedata.com/price` +
        `?symbol=${encodeURIComponent(instrumento.ticker)}` +
        `&exchange=XJPX` +
        `&apikey=${encodeURIComponent(TWELVE_DATA_JP_KEY)}`;

    try {
        const json = await fetchJsonConRetry(url);
        if (json?.status === "error") return null;

        const precio = numeroValidoConLimpieza(json?.price);
        if (precio === null) return null;

        return {
            instrumentoId: instrumento.id,
            ticker: instrumento.ticker,
            precio,
            fecha: fechaTokioDesdeDate(new Date()),
            proveedor: "TWELVE_DATA"
        };
    } catch {
        return null;
    }
}

async function ejecutarTwelveDataJapon(
    instrumentos: InstrumentoJapon[]
): Promise<ResultadoProveedorJapon> {
    if (instrumentos.length === 0) {
        return { resueltos: [], pendientes: [] };
    }

    if (!TWELVE_DATA_JP_KEY) {
        console.log("[TWELVE JP] Sin API key. Se omite fallback.");
        return { resueltos: [], pendientes: instrumentos };
    }

    const candidatos = instrumentos.slice(0, TWELVE_JP_MAX_PER_RUN);
    const noIntentados = instrumentos.slice(TWELVE_JP_MAX_PER_RUN);

    const resueltos: PrecioResueltoJapon[] = [];
    const pendientes: InstrumentoJapon[] = [];
    const intervalo = Math.ceil(60000 / TWELVE_JP_RPM);

    for (let i = 0; i < candidatos.length; i++) {
        const instrumento = candidatos[i];
        const resultado = await resolverTwelveDataJapon(instrumento);

        if (resultado) {
            resueltos.push(resultado);
        } else {
            pendientes.push(instrumento);
        }

        if (i < candidatos.length - 1) {
            await dormir(intervalo);
        }
    }

    pendientes.push(...noIntentados);
    return { resueltos, pendientes };
}

// ============================================================================
// BD: UPSERT COTIZACION_DIARIA (compartido USA + TAIWAN)
// ============================================================================

async function guardarCotizacionesUSA(
    cotizaciones: PrecioResueltoUSA[]
): Promise<number> {
    if (cotizaciones.length === 0) return 0;

    // La clave única debe ser (instrumento_id, fecha).
    // El último valor obtenido para ese día sustituye al anterior.
    const lotes = dividirEnLotes(cotizaciones, 1000);
    let total = 0;

    const conn = typeof (conexion as any).getConnection === "function"
        ? await (conexion as any).getConnection()
        : conexion as any;

    try {
        await conn.beginTransaction?.();

        for (const lote of lotes) {
            const values = lote.map(c => [
                c.instrumentoId,
                c.fecha,
                c.precio
            ]);

            const [result]: any = await conn.query(
                `
                INSERT INTO cotizacion_diaria (
                    instrumento_id,
                    fecha,
                    precio_cierre
                )
                VALUES ?
                ON DUPLICATE KEY UPDATE
                    precio_cierre = VALUES(precio_cierre)
                `,
                [values]
            );

            total += Number(result?.affectedRows || lote.length);
        }

        await conn.commit?.();
        return total;
    } catch (error) {
        await conn.rollback?.();
        throw error;
    } finally {
        if (conn !== conexion && typeof conn.release === "function") {
            conn.release();
        }
    }
}

async function guardarCotizacionesTaiwan(
    cotizaciones: PrecioResueltoTaiwan[]
): Promise<number> {
    if (cotizaciones.length === 0) return 0;

    const values = cotizaciones.map(c => [c.instrumentoId, c.fecha, c.precio]);

    const [result]: any = await (conexion as any).query(
        `
        INSERT INTO cotizacion_diaria (
            instrumento_id,
            fecha,
            precio_cierre
        )
        VALUES ?
        ON DUPLICATE KEY UPDATE
            precio_cierre = VALUES(precio_cierre)
        `,
        [values]
    );

    return Number(result?.affectedRows || cotizaciones.length);
}

async function guardarCotizacionesJapon(
    cotizaciones: PrecioResueltoJapon[]
): Promise<number> {
    if (cotizaciones.length === 0) return 0;

    // Deduplicamos por (instrumento_id, fecha) antes de insertar, por si
    // Yahoo y Twelve Data llegaran a resolver el mismo par en la misma pasada.
    const mapa = new Map<string, PrecioResueltoJapon>();
    for (const cotizacion of cotizaciones) {
        const clave = `${cotizacion.instrumentoId}|${cotizacion.fecha}`;
        mapa.set(clave, cotizacion);
    }

    const values = Array.from(mapa.values()).map(c => [
        c.instrumentoId,
        c.fecha,
        c.precio
    ]);

    const lotes = dividirEnLotes(values, 1000);
    let total = 0;

    for (const lote of lotes) {
        const [result]: any = await (conexion as any).query(
            `
            INSERT INTO cotizacion_diaria (
                instrumento_id,
                fecha,
                precio_cierre
            )
            VALUES ?
            ON DUPLICATE KEY UPDATE
                precio_cierre = VALUES(precio_cierre)
            `,
            [lote]
        );

        total += Number(result?.affectedRows || lote.length);
    }

    return total;
}

// ============================================================================
// ORQUESTADOR - USA
// ============================================================================

async function ejecutarActualizacionUSA(): Promise<{
    resumen: ResumenEjecucionUSA;
    sinResolver: InstrumentoUSA[];
    cotizaciones: PrecioResueltoUSA[];
}> {
    const inicioTotal = Date.now();

    const statsAlpaca = crearStats();
    const statsFinnhub = crearStats();
    const statsTwelve = crearStats();

    const instrumentos = await cargarInstrumentosUSA();
    console.log(`[USA] Instrumentos a actualizar: ${instrumentos.length}`);

    // -------------------- FASE 1: ALPACA --------------------
    const alpaca = await resolverConAlpaca(instrumentos, statsAlpaca);

    let pendientes = instrumentos.filter(i => !alpaca.has(i.id));
    console.log(
        `[USA] Alpaca resolvió ${alpaca.size}; pendientes: ${pendientes.length}`
    );

    // -------------------- FASE 2: FINNHUB -------------------
    const finnhub = await resolverConFinnhub(pendientes, statsFinnhub);
    pendientes = pendientes.filter(i => !finnhub.has(i.id));
    console.log(
        `[USA] Finnhub resolvió ${finnhub.size}; pendientes: ${pendientes.length}`
    );

    // -------------------- FASE 3: TWELVE DATA ---------------
    const twelve = await resolverConTwelveData(pendientes, statsTwelve);
    pendientes = pendientes.filter(i => !twelve.has(i.id));
    console.log(
        `[USA] Twelve Data resolvió ${twelve.size}; pendientes: ${pendientes.length}`
    );

    // Consolidación por instrumento. Prioridad: Alpaca > Finnhub > Twelve.
    // Como cada fase solo recibe pendientes, no debería haber colisiones.
    const mapaFinal = new Map<number, PrecioResueltoUSA>();
    for (const r of alpaca.values()) mapaFinal.set(r.instrumentoId, r);
    for (const r of finnhub.values()) mapaFinal.set(r.instrumentoId, r);
    for (const r of twelve.values()) mapaFinal.set(r.instrumentoId, r);

    const cotizaciones = Array.from(mapaFinal.values());
    const totalUpserts = await guardarCotizacionesUSA(cotizaciones);

    const resumen: ResumenEjecucionUSA = {
        totalInstrumentos: instrumentos.length,
        alpaca: statsAlpaca,
        finnhub: statsFinnhub,
        twelveData: statsTwelve,
        totalResueltos: cotizaciones.length,
        totalSinResolver: pendientes.length,
        totalUpserts,
        duracionTotalMs: Date.now() - inicioTotal
    };

    console.log("[USA] RESUMEN:", resumen);

    return {
        resumen,
        sinResolver: pendientes,
        cotizaciones
    };
}

// ============================================================================
// ORQUESTADOR - TAIWAN
// ============================================================================

async function ejecutarActualizacionTaiwan(): Promise<{
    resumen: ResumenEjecucionTaiwan;
    sinResolver: InstrumentoTaiwan[];
    cotizaciones: PrecioResueltoTaiwan[];
}> {
    const inicioTotal = Date.now();

    const instrumentos = await cargarInstrumentosTaiwan();
    console.log(`[TW] Instrumentos a actualizar: ${instrumentos.length}`);

    // -------------------- FASE 1: YAHOO --------------------
    const resultadosYahoo = await mapConConcurrencia(
        instrumentos,
        YAHOO_CONCURRENCY,
        resolverYahoo
    );

    const yahoo = new Map<number, PrecioResueltoTaiwan>();
    for (const resultado of resultadosYahoo) {
        if (resultado) yahoo.set(resultado.instrumentoId, resultado);
    }

    let pendientes = instrumentos.filter(i => !yahoo.has(i.id));
    console.log(`[TW] Yahoo resolvió ${yahoo.size}; pendientes: ${pendientes.length}`);

    // -------------------- FASE 2: TWSE / TPEX OFICIAL --------------------
    const oficiales = await resolverConCierreOficial(pendientes);
    pendientes = pendientes.filter(i => !oficiales.has(i.id));
    console.log(
        `[TW] TWSE/TPEx resolvió ${oficiales.size}; pendientes: ${pendientes.length}`
    );

    // Consolidación por instrumento. Prioridad: Yahoo > Oficial.
    const mapaFinal = new Map<number, PrecioResueltoTaiwan>();
    for (const r of yahoo.values()) mapaFinal.set(r.instrumentoId, r);
    for (const r of oficiales.values()) mapaFinal.set(r.instrumentoId, r);

    const cotizaciones = Array.from(mapaFinal.values());
    const totalUpserts = await guardarCotizacionesTaiwan(cotizaciones);

    const resumen: ResumenEjecucionTaiwan = {
        totalInstrumentos: instrumentos.length,
        yahoo: yahoo.size,
        oficialTwseTpex: oficiales.size,
        totalResueltos: cotizaciones.length,
        totalSinResolver: pendientes.length,
        totalUpserts,
        duracionTotalMs: Date.now() - inicioTotal
    };

    console.log("[TW] RESUMEN:", resumen);

    return { resumen, sinResolver: pendientes, cotizaciones };
}

// ============================================================================
// ORQUESTADOR - JAPON
// ============================================================================

async function ejecutarActualizacionJapon(): Promise<{
    resumen: ResumenEjecucionJapon;
    sinResolver: InstrumentoJapon[];
    cotizaciones: PrecioResueltoJapon[];
}> {
    const inicioTotal = Date.now();

    const instrumentos = await cargarInstrumentosJapon();
    console.log(`[JP] Instrumentos a actualizar: ${instrumentos.length}`);

    if (instrumentos.length === 0) {
        const resumenVacio: ResumenEjecucionJapon = {
            totalInstrumentos: 0,
            yahoo: 0,
            twelveData: 0,
            totalResueltos: 0,
            totalSinResolver: 0,
            totalUpserts: 0,
            duracionTotalMs: Date.now() - inicioTotal
        };

        console.warn("[JP] No existen instrumentos japoneses.");
        console.log("[JP] RESUMEN:", resumenVacio);

        return { resumen: resumenVacio, sinResolver: [], cotizaciones: [] };
    }

    // -------------------- FASE 1: YAHOO --------------------
    const yahoo = await ejecutarYahooJapon(instrumentos);
    console.log(
        `[JP] Yahoo resolvió ${yahoo.resueltos.length}; pendientes: ${yahoo.pendientes.length}`
    );

    // -------------------- FASE 2: TWELVE DATA (opcional) --------------------
    const twelve = await ejecutarTwelveDataJapon(yahoo.pendientes);
    console.log(
        `[JP] Twelve Data resolvió ${twelve.resueltos.length}; pendientes: ${twelve.pendientes.length}`
    );

    // -------------------- GUARDADO --------------------
    const cotizaciones = [...yahoo.resueltos, ...twelve.resueltos];
    const totalUpserts = await guardarCotizacionesJapon(cotizaciones);

    const resumen: ResumenEjecucionJapon = {
        totalInstrumentos: instrumentos.length,
        yahoo: yahoo.resueltos.length,
        twelveData: twelve.resueltos.length,
        totalResueltos: cotizaciones.length,
        totalSinResolver: twelve.pendientes.length,
        totalUpserts,
        duracionTotalMs: Date.now() - inicioTotal
    };

    console.log("[JP] RESUMEN:", resumen);

    return { resumen, sinResolver: twelve.pendientes, cotizaciones };
}

// ============================================================================
// ENDPOINTS EXPRESS
// POST /api/cotizacion-diaria/usa/actualizar
// POST /api/cotizacion-diaria/taiwan/actualizar
// POST /api/cotizacion-diaria/japon/actualizar
// ============================================================================

export async function actualizarCotizacionesUSA(
    _req: Request,
    res: Response
): Promise<void> {
    try {
        const resultado = await ejecutarActualizacionUSA();

        res.status(200).json({
            ok: true,
            mensaje: "Actualización USA finalizada.",
            resumen: resultado.resumen,
            sinResolver: resultado.sinResolver.slice(0, 200).map(i => ({
                instrumento_id: i.id,
                ticker: i.ticker,
                mercado: i.mercado
            }))
        });
    } catch (error) {
        console.error("[USA] Error crítico:", error);
        res.status(500).json({
            ok: false,
            mensaje: "No se pudo actualizar COTIZACION_DIARIA para USA.",
            error: error instanceof Error ? error.message : String(error)
        });
    }
}

export async function actualizarCotizacionesTaiwan(
    _req: Request,
    res: Response
): Promise<void> {
    try {
        const resultado = await ejecutarActualizacionTaiwan();

        res.status(200).json({
            ok: true,
            mensaje: "Actualización Taiwán finalizada.",
            resumen: resultado.resumen,
            sinResolver: resultado.sinResolver.slice(0, 200).map(i => ({
                instrumento_id: i.id,
                ticker: i.ticker,
                mercado: i.mercado
            }))
        });
    } catch (error) {
        console.error("[TW] Error crítico:", error);
        res.status(500).json({
            ok: false,
            mensaje: "No se pudo actualizar COTIZACION_DIARIA para Taiwán.",
            error: error instanceof Error ? error.message : String(error)
        });
    }
}

export async function actualizarCotizacionesJapon(
    _req: Request,
    res: Response
): Promise<void> {
    try {
        const resultado = await ejecutarActualizacionJapon();

        res.status(200).json({
            ok: true,
            mensaje: "Actualización Japón finalizada.",
            resumen: resultado.resumen,
            sinResolver: resultado.sinResolver.slice(0, 200).map(i => ({
                instrumento_id: i.id,
                ticker: i.ticker
            }))
        });
    } catch (error) {
        console.error("[JP] Error crítico:", error);
        res.status(500).json({
            ok: false,
            mensaje: "No se pudo actualizar COTIZACION_DIARIA para Japón.",
            error: error instanceof Error ? error.message : String(error)
        });
    }
}

// Exports opcionales para poder ejecutarlos desde cron/service sin HTTP.
export {
    ejecutarActualizacionUSA,
    ejecutarActualizacionTaiwan,
    ejecutarActualizacionJapon
};

// ============================================================================
// EJECUCIÓN DIRECTA: corre USA y luego TAIWAN, en secuencia.
// ============================================================================

async function ejecutarTodo() {
    // const resultadoUSA = await ejecutarActualizacionUSA();
    // console.log("Terminado USA:", resultadoUSA.resumen);

    const resultadoTaiwan = await ejecutarActualizacionTaiwan();
    console.log("Terminado Taiwán:", resultadoTaiwan.resumen);

    // const resultadoJapon = await ejecutarActualizacionJapon();
    // console.log("Terminado Japón:", resultadoJapon.resumen);
}

if (require.main === module) {
    ejecutarTodo()
        .then(() => {
            process.exit(0);
        })
        .catch(error => {
            console.error("Error ejecutando la actualización:", error);
            process.exit(1);
        });
}