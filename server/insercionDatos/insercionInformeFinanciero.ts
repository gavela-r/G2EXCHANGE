import { Request, Response } from "express";
import conexion from "../conexion/bd";

// ============================================================================
// INFORME_FINANCIERO - ESTADOS UNIDOS + JAPON
//
// USA:
// FUENTE: SEC EDGAR - Submissions API
// Descarga los informes 10-K y 10-Q de los ultimos 4 años correspondientes
// a las empresas USA existentes en nuestra BD. NO necesita API KEY.
// SEC: https://data.sec.gov/submissions/CIK##########.json
// TICKER -> CIK: https://www.sec.gov/files/company_tickers.json
//
// JAPON:
// FUENTE: EDINET (Financial Services Agency)
// Descarga los informes anuales/semestrales/trimestrales de los ultimos
// 4 años correspondientes a las empresas japonesas existentes en nuestra BD.
// Requiere EDINET_API_KEY.
//
// TAIWAN:
// FUENTE: FinMind. Procesado con N workers concurrentes que comparten UN
// unico limitador de peticiones por minuto (ver CONFIGURACIÓN TAIWAN).
// ============================================================================

// ============================================================================
// CONFIGURACIÓN USA
// ============================================================================

const SEC_USER_AGENT =
    process.env.SEC_USER_AGENT || "G2Exchange contacto@tudominio.com";

// SEC permite como maximo 10 peticiones/segundo.
// Trabajamos a ~7 peticiones/segundo para dejar margen.
const SEC_INTERVALO_MS = Number(process.env.SEC_INTERVALO_MS || "140");

// Ultimos 4 años.
const ANOS_HISTORICO = Number(process.env.SEC_FINANCIAL_YEARS || "5"); // buffer de descarga para asegurar 4 FY

const HTTP_TIMEOUT_MS = Number(process.env.SEC_TIMEOUT_MS || "15000");
const MAX_RETRIES = Number(process.env.SEC_MAX_RETRIES || "3");

// ============================================================================
// CONFIGURACIÓN JAPON
// ============================================================================

const JP_EDINET_API_KEY = process.env.EDINET_API_KEY || "2bdcdc44161941f995fe6917214aff65";

const JP_ANOS_HISTORICO = Number(process.env.EDINET_YEARS || "5"); // buffer de descarga para asegurar 4 FY

// Para la carga historica inicial:
// 1 request / segundo.
// ~1461 dias = ~24 minutos teoricos + latencia.
// Una vez cargado el historico, NO hay que repetir los 4 años cada dia.
const JP_EDINET_INTERVAL_MS = Number(process.env.EDINET_INTERVAL_MS || "1000");

const JP_EDINET_TIMEOUT_MS = Number(process.env.EDINET_TIMEOUT_MS || "20000");
const JP_EDINET_MAX_RETRIES = Number(process.env.EDINET_MAX_RETRIES || "3");

// ============================================================================
// CONFIGURACIÓN TAIWAN
// ============================================================================

const TW_FINMIND_TOKEN = process.env.FINMIND_TOKEN || "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJ1c2VyX2lkIjoiYWRyaWFuZ2F2ZWxhMDlAZ21haWwuY29tIiwiZW1haWwiOiJhZHJpYW5nYXZlbGEwOUBnbWFpbC5jb20iLCJ0b2tlbl92ZXJzaW9uIjowfQ.lqj290e1tvguRgDgxiWJLtzLGyvFMm6ez3cG3pmbyDU";
const TW_ANOS_HISTORICO = Number(process.env.FINMIND_TW_YEARS || "5"); // buffer de descarga para asegurar 4 FY

// LIMITE GLOBAL de peticiones por minuto, COMPARTIDO por todos los workers.
// FinMind: 600 peticiones/hora CON token (~9-10/min), pero solo 300/hora
// SIN token (~5/min). Si TW_FINMIND_TOKEN esta vacio, el limite real es la
// mitad del que configures aqui: se ajusta solo en ejecutarCargaInformesTaiwan
// (ver twRpmEfectivo). Con ese limite, mas workers NO descargan mas rapido:
// solo solapan la latencia de red y las escrituras en BD.
// Si tu cuenta de FinMind tiene un cupo mayor (Backer/Sponsor), sube este
// valor en el .env (p. ej. FINMIND_TW_RPM=60) y ahi si se nota la concurrencia.
const TW_RPM = Number(process.env.FINMIND_TW_RPM || "9");

// Limite real de FinMind sin token (300/hora). Se usa como techo cuando
// TW_FINMIND_TOKEN esta vacio, para no configurar sin querer un ritmo que
// el propio FinMind va a rechazar.
const TW_RPM_SIN_TOKEN = Number(process.env.FINMIND_TW_RPM_SIN_TOKEN || "4");

// Numero de workers ("agentes") concurrentes.
const TW_CONCURRENCIA = Number(process.env.FINMIND_TW_CONCURRENCY || "5");

const TW_TIMEOUT_MS = Number(process.env.FINMIND_TW_TIMEOUT_MS || "20000");
const TW_MAX_RETRIES = Number(process.env.FINMIND_TW_MAX_RETRIES || "3");

// Si FinMind responde 402/429 (cupo agotado), TODOS los workers se detienen.
// La cuota de FinMind es POR HORA, no por minuto: un bloqueo corto (p. ej.
// 5 min) casi nunca es suficiente y provoca varios 402 seguidos hasta que
// la ventana horaria realmente se libera. Por eso el bloqueo crece:
// TW_COOLDOWN_LIMITE_MS, el doble, el doble... hasta TW_COOLDOWN_LIMITE_MAX_MS.
const TW_COOLDOWN_LIMITE_MS = Number(process.env.FINMIND_TW_COOLDOWN_MS || "300000");
const TW_COOLDOWN_LIMITE_MAX_MS = Number(process.env.FINMIND_TW_COOLDOWN_MAX_MS || "1200000");
const TW_MAX_RETRIES_LIMITE = Number(process.env.FINMIND_TW_MAX_RETRIES_LIMITE || "12");

// ============================================================================
// TIPOS USA
// ============================================================================

interface EmpresaUSA {
    empresa_id: number;
    ticker: string;
}

interface EmpresaSEC {
    cik_str: number;
    ticker: string;
    title: string;
}

interface InformeSEC {
    empresaId: number;
    tipoPeriodo: "ANUAL" | "TRIMESTRAL";
    tipoDocumento: "10-K" | "10-Q";
    fechaFinPeriodo: string | null;
    fechaPublicacion: string;
    fuente: "SEC_EDGAR";
    identificadorFuente: string;
}

// ============================================================================
// TIPOS JAPON
// ============================================================================

interface JPInstrumentoEmpresa {
    empresa_id: number;
    ticker: string;
}

interface JPInformeFinanciero {
    empresaId: number;
    tipoPeriodo: "ANUAL" | "SEMESTRAL" | "TRIMESTRAL";
    tipoDocumento: string;
    fechaFinPeriodo: string | null;
    fechaPublicacion: string;
    fuente: "EDINET";
    identificadorFuente: string;
}

// ============================================================================
// TIPOS TAIWAN
// ============================================================================

interface TWInstrumentoEmpresa {
    empresa_id: number;
    ticker: string;
}

interface TWInformeFinanciero {
    empresaId: number;
    tipoPeriodo: "ANUAL" | "TRIMESTRAL";
    tipoDocumento: string;
    fechaFinPeriodo: string;
    fechaPublicacion: null;
    fuente: "FINMIND";
    identificadorFuente: string;
}

// ============================================================================
// UTILIDADES USA
// ============================================================================

function dormir(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function normalizarTicker(valor: unknown): string {
    return String(valor || "").trim().toUpperCase();
}

function normalizarCIK(cik: number | string): string {
    return String(cik).replace(/\D/g, "").padStart(10, "0");
}

function fechaLimiteHistorico(): Date {
    const fecha = new Date();
    fecha.setUTCFullYear(fecha.getUTCFullYear() - ANOS_HISTORICO);
    return fecha;
}

function fechaValida(fecha: unknown): string | null {
    if (!fecha) return null;

    const valor = String(fecha).trim();

    if (!/^\d{4}-\d{2}-\d{2}$/.test(valor)) {
        return null;
    }

    return valor;
}

// ============================================================================
// UTILIDADES JAPON
// ============================================================================

function jpDormir(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function jpNormalizarTicker(valor: unknown): string {
    return String(valor || "").trim().toUpperCase().replace(/\.T$/i, "");
}

function jpFechaValida(valor: unknown): string | null {
    if (!valor) return null;

    const texto = String(valor).trim().slice(0, 10);

    if (!/^\d{4}-\d{2}-\d{2}$/.test(texto)) {
        return null;
    }

    return texto;
}

// ============================================================================
// UTILIDADES TAIWAN
// ============================================================================

function twDormir(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function twNormalizarTicker(ticker: unknown): string {
    return String(ticker || "")
        .trim()
        .toUpperCase()
        .replace(/\.TW$/i, "")
        .replace(/\.TWO$/i, "");
}

function twFechaValida(valor: unknown): string | null {
    if (!valor) return null;

    const texto = String(valor).trim().slice(0, 10);

    return /^\d{4}-\d{2}-\d{2}$/.test(texto) ? texto : null;
}

function twFechaInicioHistorico(): string {
    const fecha = new Date();
    fecha.setUTCFullYear(fecha.getUTCFullYear() - TW_ANOS_HISTORICO);
    return fecha.toISOString().slice(0, 10);
}

// ============================================================================
// LIMITADOR GLOBAL FINMIND (TAIWAN)
//
// Todos los workers piden "turno" antes de CADA peticion (incluidos los
// reintentos). El turno se reserva de forma sincrona: en Node no hay
// condiciones de carrera entre leer y escribir twProximoSlot.
//
// - twProximoSlot: instante mas temprano en que puede salir la siguiente
//   peticion (separadas por 60000 / TW_RPM ms).
// - twBloqueadoHasta: pausa global cuando FinMind responde 402/429.
// ============================================================================

let twProximoSlot = 0;
let twBloqueadoHasta = 0;

// RPM realmente aplicado. Arranca en TW_RPM y se recorta a TW_RPM_SIN_TOKEN
// en ejecutarCargaInformesTaiwan si no hay token configurado.
let twRpmEfectivo = TW_RPM;

async function twEsperarTurno(): Promise<void> {
    const intervaloMs = Math.ceil(60000 / Math.max(1, twRpmEfectivo));

    while (true) {
        const ahora = Date.now();

        // Pausa global por limite alcanzado.
        if (ahora < twBloqueadoHasta) {
            await twDormir(twBloqueadoHasta - ahora);
            continue;
        }

        // Reservar slot (sincrono, sin await entre lectura y escritura).
        const slot = Math.max(ahora, twProximoSlot);
        twProximoSlot = slot + intervaloMs;

        if (slot > ahora) {
            await twDormir(slot - ahora);
        }

        // Si mientras esperabamos otro worker activo el bloqueo, volver a esperar.
        if (Date.now() < twBloqueadoHasta) {
            continue;
        }

        return;
    }
}

function twBloquearTemporalmente(
    estado: number,
    intentosLimite: number
): void {
    // Varios workers pueden recibir el 402/429 a la vez: solo el primero activa el bloqueo.
    if (Date.now() < twBloqueadoHasta) return;

    // Backoff creciente: TW_COOLDOWN_LIMITE_MS * 2^intentosLimite, con techo
    // TW_COOLDOWN_LIMITE_MAX_MS. La cuota de FinMind es horaria, asi que un
    // bloqueo corto en los primeros intentos y mas largo despues evita
    // machacar la API con reintentos inutiles.
    const ms = Math.min(
        TW_COOLDOWN_LIMITE_MS * Math.pow(2, intentosLimite),
        TW_COOLDOWN_LIMITE_MAX_MS
    );

    twBloqueadoHasta = Date.now() + ms;

    console.warn(
        `[FINMIND TW] HTTP ${estado}: cupo agotado (intento ${intentosLimite + 1}/${TW_MAX_RETRIES_LIMITE}). ` +
        `Todos los workers en pausa ${Math.round(ms / 1000)} s.`
    );
}

// ============================================================================
// GENERAR FECHAS ULTIMOS 4 AÑOS (JAPON)
// ============================================================================

function jpGenerarFechas(): string[] {
    const resultado: string[] = [];
    const hoy = new Date();
    const inicio = new Date();

    inicio.setUTCFullYear(inicio.getUTCFullYear() - JP_ANOS_HISTORICO);

    // Añadimos un pequeño margen para no perder filings justo en el limite temporal.
    inicio.setUTCDate(inicio.getUTCDate() - 7);

    const actual = new Date(inicio);

    while (actual <= hoy) {
        const yyyy = actual.getUTCFullYear();
        const mm = String(actual.getUTCMonth() + 1).padStart(2, "0");
        const dd = String(actual.getUTCDate()).padStart(2, "0");

        resultado.push(`${yyyy}-${mm}-${dd}`);

        actual.setUTCDate(actual.getUTCDate() + 1);
    }

    return resultado;
}

// ============================================================================
// FETCH SEC (USA)
// ============================================================================

async function fetchSEC(url: string, intento = 0): Promise<any> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), HTTP_TIMEOUT_MS);

    try {
        const response = await fetch(url, {
            headers: {
                "User-Agent": SEC_USER_AGENT,
                "Accept-Encoding": "gzip, deflate",
                "Accept": "application/json"
            },
            signal: controller.signal
        });

        clearTimeout(timeout);

        // ================================================================
        // RATE LIMIT
        // ================================================================

        if (response.status === 429 && intento < MAX_RETRIES) {
            const espera = Math.min(2000 * Math.pow(2, intento), 30000);

            console.warn(`[SEC] 429. Esperando ${espera} ms.`);

            await dormir(espera);

            return fetchSEC(url, intento + 1);
        }

        // ================================================================
        // ERRORES TEMPORALES
        // ================================================================

        if (response.status >= 500 && intento < MAX_RETRIES) {
            const espera = Math.min(1000 * Math.pow(2, intento), 15000);

            await dormir(espera);

            return fetchSEC(url, intento + 1);
        }

        if (!response.ok) {
            throw new Error(`SEC HTTP ${response.status}`);
        }

        return await response.json();
    } catch (error) {
        clearTimeout(timeout);

        if (intento < MAX_RETRIES) {
            await dormir(1000 * Math.pow(2, intento));

            return fetchSEC(url, intento + 1);
        }

        throw error;
    }
}

// ============================================================================
// FETCH EDINET (JAPON)
// ============================================================================

async function jpFetchEdinet(url: string, intento = 0): Promise<any> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), JP_EDINET_TIMEOUT_MS);

    try {
        const response = await fetch(url, {
            headers: {
                "Accept": "application/json",
                "User-Agent": "G2Exchange/1.0"
            },
            signal: controller.signal
        });

        clearTimeout(timeout);

        // ---------------------------------------------------------------
        // 429
        // ---------------------------------------------------------------

        if (response.status === 429 && intento < JP_EDINET_MAX_RETRIES) {
            const espera = Math.min(3000 * Math.pow(2, intento), 60000);

            console.warn(`[EDINET] 429. Esperando ${espera} ms.`);

            await jpDormir(espera);

            return jpFetchEdinet(url, intento + 1);
        }

        // ---------------------------------------------------------------
        // ERRORES TEMPORALES
        // ---------------------------------------------------------------

        if (response.status >= 500 && intento < JP_EDINET_MAX_RETRIES) {
            const espera = Math.min(2000 * Math.pow(2, intento), 30000);

            await jpDormir(espera);

            return jpFetchEdinet(url, intento + 1);
        }

        if (!response.ok) {
            const texto = await response.text();

            throw new Error(
                `EDINET HTTP ${response.status}: ${texto.slice(0, 300)}`
            );
        }

        return await response.json();
    } catch (error) {
        clearTimeout(timeout);

        if (intento < JP_EDINET_MAX_RETRIES) {
            const espera = Math.min(2000 * Math.pow(2, intento), 30000);

            await jpDormir(espera);

            return jpFetchEdinet(url, intento + 1);
        }

        throw error;
    }
}

// ============================================================================
// FETCH FINMIND (TAIWAN)
//
// - Cada intento pasa por el limitador global (twEsperarTurno).
// - 402/429 (cupo agotado): pausa global de TODOS los workers y reintento.
//   Se cuenta aparte (intentosLimite) de los errores normales (intento).
// ============================================================================

async function twFetchFinMind(
    url: string,
    intento = 0,
    intentosLimite = 0
): Promise<any> {
    await twEsperarTurno();

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TW_TIMEOUT_MS);

    // Gestion comun del cupo agotado (HTTP 402/429 o status 402/429 en el JSON).
    const gestionarLimite = (estado: number): Promise<any> => {
        if (intentosLimite >= TW_MAX_RETRIES_LIMITE) {
            const err: any = new Error(
                `FinMind: cupo agotado (${estado}) tras ${intentosLimite} esperas`
            );
            err.esLimite = true;
            throw err;
        }

        twBloquearTemporalmente(estado, intentosLimite);

        return twFetchFinMind(url, intento, intentosLimite + 1);
    };

    try {
        const headers: Record<string, string> = { "Accept": "application/json" };

        if (TW_FINMIND_TOKEN) {
            headers.Authorization = `Bearer ${TW_FINMIND_TOKEN}`;
        }

        const response = await fetch(url, { headers, signal: controller.signal });

        clearTimeout(timeout);

        if (response.status === 402 || response.status === 429) {
            return gestionarLimite(response.status);
        }

        if (response.status >= 500 && intento < TW_MAX_RETRIES) {
            const espera = Math.min(2000 * Math.pow(2, intento), 30000);

            await twDormir(espera);

            return twFetchFinMind(url, intento + 1, intentosLimite);
        }

        if (!response.ok) {
            const texto = await response.text();

            throw new Error(
                `FinMind HTTP ${response.status}: ${texto.slice(0, 300)}`
            );
        }

        const json = await response.json();
        const statusJson = Number(json?.status);

        if (statusJson === 402 || statusJson === 429) {
            return gestionarLimite(statusJson);
        }

        if (json?.status && statusJson !== 200) {
            throw new Error(`FinMind status ${json.status}: ${json?.msg || ""}`);
        }

        return json;
    } catch (error) {
        clearTimeout(timeout);

        // Cupo agotado definitivamente: no reintentar mas.
        if ((error as any)?.esLimite) {
            throw error;
        }

        if (intento < TW_MAX_RETRIES) {
            await twDormir(2000 * Math.pow(2, intento));

            return twFetchFinMind(url, intento + 1, intentosLimite);
        }

        throw error;
    }
}

async function descargarMapaCIK(): Promise<Map<string, string>> {
    console.log("[SEC] Descargando mapa ticker -> CIK...");

    const url = "https://www.sec.gov/files/company_tickers.json";
    const json = await fetchSEC(url);

    const mapa = new Map<string, string>();

    for (const fila of Object.values(json) as EmpresaSEC[]) {
        const ticker = normalizarTicker(fila.ticker);

        if (!ticker) continue;

        mapa.set(ticker, normalizarCIK(fila.cik_str));
    }

    console.log(`[SEC] Tickers mapeados: ${mapa.size}`);

    return mapa;
}

// ============================================================================
// EMPRESAS USA DE NUESTRA BD
// ============================================================================

async function cargarEmpresasUSA(): Promise<EmpresaUSA[]> {
    const db = conexion as any;

    // Utilizamos INSTRUMENTO para obtener el ticker asociado a la EMPRESA.
    // Si una empresa posee varios instrumentos, posteriormente eliminamos
    // duplicados por empresa_id.
    const [rows]: any = await db.query(
        `
        SELECT DISTINCT
            e.id AS empresa_id,
            i.ticker
        FROM empresa e
        INNER JOIN instrumento i
            ON i.empresa_id = e.id
        INNER JOIN mercado m
            ON m.id = i.mercado_id
        WHERE UPPER(m.nombre_bolsa) IN (
            'NASDAQ STOCK MARKET',
            'NEW YORK STOCK EXCHANGE',
            'NYSE AMERICAN'
        )
        AND i.ticker IS NOT NULL
        AND TRIM(i.ticker) <> ''
        ORDER BY e.id
        `
    );

    return rows.map((row: any) => ({
        empresa_id: Number(row.empresa_id),
        ticker: normalizarTicker(row.ticker)
    }));
}

// ============================================================================
// CARGAR EMPRESAS JAPONESAS DE NUESTRA BD
// ============================================================================

async function jpCargarEmpresas(): Promise<Map<string, number>> {
    const db = conexion as any;

    const [rows]: any = await db.query(
        `
        SELECT DISTINCT
            e.id AS empresa_id,
            i.ticker
        FROM empresa e
        INNER JOIN instrumento i
            ON i.empresa_id = e.id
        INNER JOIN mercado m
            ON m.id = i.mercado_id
        WHERE UPPER(m.nombre_bolsa) = 'TOKYO STOCK EXCHANGE'
          AND i.ticker IS NOT NULL
          AND TRIM(i.ticker) <> ''
        ORDER BY e.id
        `
    );

    const mapa = new Map<string, number>();

    for (const row of rows) {
        const ticker = jpNormalizarTicker(row.ticker);

        if (!ticker) continue;

        mapa.set(ticker, Number(row.empresa_id));
    }

    console.log(`[JP] Empresas/tickers cargados desde BD: ${mapa.size}`);

    return mapa;
}

// ============================================================================
// CARGAR EMPRESAS TAIWAN DE NUESTRA BD
// ============================================================================

async function twCargarEmpresas(): Promise<TWInstrumentoEmpresa[]> {
    const db = conexion as any;

    const [rows]: any = await db.query(
        `
        SELECT DISTINCT
            e.id AS empresa_id,
            i.ticker
        FROM empresa e
        INNER JOIN instrumento i
            ON i.empresa_id = e.id
        INNER JOIN mercado m
            ON m.id = i.mercado_id
        WHERE UPPER(m.nombre_bolsa) IN (
            'TAIWAN STOCK EXCHANGE',
            'TAIPEI EXCHANGE'
        )
        AND i.ticker IS NOT NULL
        AND TRIM(i.ticker) <> ''
        ORDER BY e.id
        `
    );

    const resultado: TWInstrumentoEmpresa[] = [];
    const empresasVistas = new Set<number>();

    for (const row of rows) {
        const empresaId = Number(row.empresa_id);
        const ticker = twNormalizarTicker(row.ticker);

        if (!empresaId || !ticker || empresasVistas.has(empresaId)) {
            continue;
        }

        empresasVistas.add(empresaId);
        resultado.push({ empresa_id: empresaId, ticker });
    }

    console.log(`[TW] Empresas cargadas desde BD: ${resultado.length}`);

    return resultado;
}

// ============================================================================
// EXTRAER 10-K / 10-Q (USA)
// ============================================================================

function extraerInformesRecientes(
    empresaId: number,
    jsonSEC: any
): InformeSEC[] {
    const resultado: InformeSEC[] = [];

    const recientes = jsonSEC?.filings?.recent;

    if (!recientes) {
        return resultado;
    }

    const forms: any[] = recientes.form || [];
    const filingDates: any[] = recientes.filingDate || [];
    const reportDates: any[] = recientes.reportDate || [];
    const accessions: any[] = recientes.accessionNumber || [];

    const fechaLimite = fechaLimiteHistorico();

    for (let i = 0; i < forms.length; i++) {
        const form = String(forms[i] || "").trim().toUpperCase();

        // ================================================================
        // SOLO CUENTAS ANUALES Y TRIMESTRALES
        // ================================================================

        if (form !== "10-K" && form !== "10-Q") {
            continue;
        }

        const fechaPublicacion = fechaValida(filingDates[i]);

        if (!fechaPublicacion) {
            continue;
        }

        const fecha = new Date(`${fechaPublicacion}T00:00:00Z`);

        if (fecha < fechaLimite) {
            continue;
        }

        const accession = String(accessions[i] || "").trim();

        if (!accession) {
            continue;
        }

        resultado.push({
            empresaId,
            tipoPeriodo: form === "10-K" ? "ANUAL" : "TRIMESTRAL",
            tipoDocumento: form as "10-K" | "10-Q",
            fechaFinPeriodo: fechaValida(reportDates[i]),
            fechaPublicacion,
            fuente: "SEC_EDGAR",
            identificadorFuente: accession
        });
    }

    return resultado;
}

// ============================================================================
// EDINET secCode -> TICKER (JAPON)
//
// EDINET devuelve secCode. Para emisores cotizados japoneses, normalmente
// el codigo EDINET de valores tiene 5 posiciones.
//
// Ejemplo conceptual:
// ticker BD: 7203
// secCode:   72030
//
// Utilizamos los primeros 4 caracteres para cruzarlo. También contemplamos
// códigos modernos alfanuméricos de cuatro caracteres.
// ============================================================================

function jpTickerDesdeSecCode(secCode: unknown): string | null {
    if (secCode === null || secCode === undefined) {
        return null;
    }

    const codigo = String(secCode).trim().toUpperCase();

    if (codigo.length < 4) {
        return null;
    }

    return codigo.slice(0, 4);
}

// ============================================================================
// IDENTIFICAR TIPO DE INFORME (JAPON)
//
// No dependemos exclusivamente de códigos numéricos internos. Utilizamos
// la descripción documental proporcionada por EDINET. Esto también permite
// convivir con:
// - régimen histórico trimestral
// - régimen semestral actual
// ============================================================================

function jpClasificarDocumento(fila: any): {
    tipoPeriodo: "ANUAL" | "SEMESTRAL" | "TRIMESTRAL";
    tipoDocumento: string;
} | null {
    const descripcion = String(fila?.docDescription || "").trim();

    if (!descripcion) {
        return null;
    }

    // ---------------------------------------------------------------
    // DESCARTAR CORRECCIONES / AMENDMENTS
    // De momento queremos el informe original. Las correcciones
    // podremos gestionarlas posteriormente mediante versionado.
    // ---------------------------------------------------------------

    if (descripcion.includes("訂正")) {
        return null;
    }

    // ---------------------------------------------------------------
    // ANUAL - 有価証券報告書
    // ---------------------------------------------------------------

    if (descripcion.includes("有価証券報告書")) {
        return {
            tipoPeriodo: "ANUAL",
            tipoDocumento: "Annual Securities Report"
        };
    }

    // ---------------------------------------------------------------
    // SEMESTRAL - 半期報告書
    // ---------------------------------------------------------------

    if (descripcion.includes("半期報告書")) {
        return {
            tipoPeriodo: "SEMESTRAL",
            tipoDocumento: "Semiannual Securities Report"
        };
    }

    // ---------------------------------------------------------------
    // TRIMESTRAL HISTORICO - 四半期報告書
    // ---------------------------------------------------------------

    if (descripcion.includes("四半期報告書")) {
        return {
            tipoPeriodo: "TRIMESTRAL",
            tipoDocumento: "Quarterly Securities Report"
        };
    }

    return null;
}

// ============================================================================
// DESCARGAR INFORMES DE UNA EMPRESA (USA)
// ============================================================================

async function descargarInformesEmpresa(
    empresaId: number,
    cik: string
): Promise<InformeSEC[]> {
    const url = `https://data.sec.gov/submissions/CIK${cik}.json`;
    const json = await fetchSEC(url);

    return extraerInformesRecientes(empresaId, json);
}

// ============================================================================
// DESCARGAR LISTADO EDINET DE UN DIA (JAPON)
// ============================================================================

async function jpDescargarDia(fecha: string): Promise<any[]> {
    const url =
        `https://api.edinet-fsa.go.jp/api/v2/documents.json` +
        `?date=${encodeURIComponent(fecha)}` +
        `&type=2` +
        `&Subscription-Key=${encodeURIComponent(JP_EDINET_API_KEY)}`;

    const json = await jpFetchEdinet(url);

    if (!Array.isArray(json?.results)) {
        return [];
    }

    return json.results;
}

// ============================================================================
// EXTRAER INFORMES DE UN DIA (JAPON)
// ============================================================================

function jpExtraerInformesDia(
    filas: any[],
    mapaEmpresas: Map<string, number>
): JPInformeFinanciero[] {
    const resultado: JPInformeFinanciero[] = [];

    for (const fila of filas) {
        // ---------------------------------------------------------------
        // Necesitamos una empresa cotizada con secCode.
        // ---------------------------------------------------------------

        const ticker = jpTickerDesdeSecCode(fila?.secCode);

        if (!ticker) continue;

        const empresaId = mapaEmpresas.get(ticker);

        if (!empresaId) continue;

        // ---------------------------------------------------------------
        // Clasificar documento
        // ---------------------------------------------------------------

        const clasificacion = jpClasificarDocumento(fila);

        if (!clasificacion) continue;

        // ---------------------------------------------------------------
        // docID: identificador único del documento EDINET.
        // ---------------------------------------------------------------

        const docId = String(fila?.docID || "").trim();

        if (!docId) continue;

        // ---------------------------------------------------------------
        // FECHA DE PUBLICACION
        // submitDateTime: YYYY-MM-DD HH:mm
        // ---------------------------------------------------------------

        const fechaPublicacion = jpFechaValida(fila?.submitDateTime);

        if (!fechaPublicacion) continue;

        // ---------------------------------------------------------------
        // FIN DE PERIODO
        // ---------------------------------------------------------------

        const fechaFinPeriodo = jpFechaValida(fila?.periodEnd);

        resultado.push({
            empresaId,
            tipoPeriodo: clasificacion.tipoPeriodo,
            tipoDocumento: clasificacion.tipoDocumento,
            fechaFinPeriodo,
            fechaPublicacion,
            fuente: "EDINET",
            identificadorFuente: docId
        });
    }

    return resultado;
}

// ============================================================================
// DESCARGAR FINANCIAL STATEMENTS (TAIWAN)
// ============================================================================

async function twDescargarFinancialStatements(ticker: string): Promise<any[]> {
    const fechaInicio = twFechaInicioHistorico();

    const url =
        `https://api.finmindtrade.com/api/v4/data` +
        `?dataset=TaiwanStockFinancialStatements` +
        `&data_id=${encodeURIComponent(ticker)}` +
        `&start_date=${encodeURIComponent(fechaInicio)}`;

    const json = await twFetchFinMind(url);

    return Array.isArray(json?.data) ? json.data : [];
}

// ============================================================================
// EXTRAER INFORMES (TAIWAN)
// ============================================================================

function twExtraerInformes(
    empresa: TWInstrumentoEmpresa,
    filas: any[]
): TWInformeFinanciero[] {
    const fechas = new Set<string>();

    for (const fila of filas) {
        const fecha = twFechaValida(fila?.date);
        if (fecha) fechas.add(fecha);
    }

    const informes: TWInformeFinanciero[] = [];

    for (const fecha of fechas) {
        const mes = Number(fecha.slice(5, 7));
        const anual = mes === 12;

        informes.push({
            empresaId: empresa.empresa_id,
            tipoPeriodo: anual ? "ANUAL" : "TRIMESTRAL",
            tipoDocumento: anual
                ? "Annual Financial Statements"
                : "Quarterly Financial Statements",
            fechaFinPeriodo: fecha,
            fechaPublicacion: null,
            fuente: "FINMIND",
            identificadorFuente: `FINMIND:${empresa.ticker}:${fecha}`
        });
    }

    return informes;
}


// ============================================================================
// RETENCION OBJETIVO DE INFORME_FINANCIERO
// ============================================================================
// Regla funcional:
//   - conservar los 4 últimos informes ANUALES (1 por ejercicio fiscal);
//   - conservar SOLO el intermedio más reciente si su fecha_fin_periodo es
//     posterior al último anual;
//   - no conservar intermedios antiguos.
// Esta capa se aplica antes del UPSERT y no afecta a VIV: VIV seguirá usando
// exclusivamente los 4 ANUALES.
// ============================================================================

type InformeRetencion = {
    tipoPeriodo: string;
    fechaFinPeriodo: string | null;
    fechaPublicacion?: string | null;
    identificadorFuente: string;
};

function seleccionarInformesObjetivo<T extends InformeRetencion>(
    informes: T[]
): T[] {
    const validos = informes.filter(x => !!x.fechaFinPeriodo);

    // 1) Un anual por ejercicio fiscal. Si hubiera más de uno, preferimos el
    // más reciente por fecha de publicación / identificador.
    const anualPorEjercicio = new Map<number, T>();

    for (const inf of validos.filter(
        x => String(x.tipoPeriodo).toUpperCase() === "ANUAL"
    )) {
        const ejercicio = Number(inf.fechaFinPeriodo!.slice(0, 4));
        const actual = anualPorEjercicio.get(ejercicio);

        if (
            !actual ||
            String(inf.fechaPublicacion || "") >
                String(actual.fechaPublicacion || "") ||
            (
                String(inf.fechaPublicacion || "") ===
                    String(actual.fechaPublicacion || "") &&
                inf.identificadorFuente > actual.identificadorFuente
            )
        ) {
            anualPorEjercicio.set(ejercicio, inf);
        }
    }

    const anuales = Array.from(anualPorEjercicio.values())
        .sort((a, b) =>
            b.fechaFinPeriodo!.localeCompare(a.fechaFinPeriodo!)
        )
        .slice(0, 4);

    const ultimoAnual = anuales[0]?.fechaFinPeriodo || null;

    // 2) Último intermedio posterior al último anual.
    const intermedio = validos
        .filter(x => String(x.tipoPeriodo).toUpperCase() !== "ANUAL")
        .filter(x => !ultimoAnual || x.fechaFinPeriodo! > ultimoAnual)
        .sort((a, b) =>
            b.fechaFinPeriodo!.localeCompare(a.fechaFinPeriodo!)
        )[0];

    return intermedio ? [...anuales, intermedio] : anuales;
}

async function guardarInformes(informes: InformeSEC[]): Promise<number> {
    if (informes.length === 0) return 0;

    const db = conexion as any;

    const valores = informes.map(informe => [
        informe.empresaId,
        informe.tipoPeriodo,
        informe.tipoDocumento,
        informe.fechaFinPeriodo,
        informe.fechaPublicacion,
        informe.fuente,
        informe.identificadorFuente
    ]);

    const [resultado]: any = await db.query(
        `
        INSERT INTO informe_financiero (
            empresa_id,
            tipo_periodo,
            tipo_documento,
            fecha_fin_periodo,
            fecha_publicacion,
            fuente,
            identificador_fuente
        )
        VALUES ?
        ON DUPLICATE KEY UPDATE
            empresa_id = VALUES(empresa_id),
            tipo_periodo = VALUES(tipo_periodo),
            tipo_documento = VALUES(tipo_documento),
            fecha_fin_periodo = VALUES(fecha_fin_periodo),
            fecha_publicacion = VALUES(fecha_publicacion)
        `,
        [valores]
    );

    return Number(resultado?.affectedRows || informes.length);
}

// ============================================================================
// GUARDAR INFORMES (JAPON)
// ============================================================================

async function jpGuardarInformes(
    informes: JPInformeFinanciero[]
): Promise<number> {
    if (informes.length === 0) return 0;

    const db = conexion as any;

    const valores = informes.map(informe => [
        informe.empresaId,
        informe.tipoPeriodo,
        informe.tipoDocumento,
        informe.fechaFinPeriodo,
        informe.fechaPublicacion,
        informe.fuente,
        informe.identificadorFuente
    ]);

    const [resultado]: any = await db.query(
        `
        INSERT INTO informe_financiero (
            empresa_id,
            tipo_periodo,
            tipo_documento,
            fecha_fin_periodo,
            fecha_publicacion,
            fuente,
            identificador_fuente
        )
        VALUES ?
        ON DUPLICATE KEY UPDATE
            empresa_id = VALUES(empresa_id),
            tipo_periodo = VALUES(tipo_periodo),
            tipo_documento = VALUES(tipo_documento),
            fecha_fin_periodo = VALUES(fecha_fin_periodo),
            fecha_publicacion = VALUES(fecha_publicacion)
        `,
        [valores]
    );

    return Number(resultado?.affectedRows || informes.length);
}

// ============================================================================
// GUARDAR INFORMES (TAIWAN)
// ============================================================================

async function twGuardarInformes(
    informes: TWInformeFinanciero[]
): Promise<number> {
    if (informes.length === 0) return 0;

    const db = conexion as any;

    const valores = informes.map(informe => [
        informe.empresaId,
        informe.tipoPeriodo,
        informe.tipoDocumento,
        informe.fechaFinPeriodo,
        informe.fechaPublicacion,
        informe.fuente,
        informe.identificadorFuente
    ]);

    const [resultado]: any = await db.query(
        `
        INSERT INTO informe_financiero (
            empresa_id,
            tipo_periodo,
            tipo_documento,
            fecha_fin_periodo,
            fecha_publicacion,
            fuente,
            identificador_fuente
        )
        VALUES ?
        ON DUPLICATE KEY UPDATE
            empresa_id = VALUES(empresa_id),
            tipo_periodo = VALUES(tipo_periodo),
            tipo_documento = VALUES(tipo_documento),
            fecha_fin_periodo = VALUES(fecha_fin_periodo),
            fecha_publicacion = VALUES(fecha_publicacion)
        `,
        [valores]
    );

    return Number(resultado?.affectedRows || informes.length);
}


// ============================================================================
// LIMPIEZA / RETENCION EN BD
// ============================================================================
// Ejecutar DESPUES de la carga de cada fuente. Requiere MySQL 8+.
// Mantiene 4 ANUALES (uno por año) + 1 último intermedio posterior al anual.
// Se limita a la fuente indicada y NO toca otras fuentes.
// ============================================================================

async function aplicarRetencionInformesFuente(
    fuente: "SEC_EDGAR" | "EDINET" | "FINMIND"
): Promise<number> {
    const db = conexion as any;

    const [resultado]: any = await db.query(
        `
        DELETE inf
        FROM informe_financiero inf
        LEFT JOIN (
            WITH anuales_rank AS (
                SELECT
                    id,
                    empresa_id,
                    fecha_fin_periodo,
                    ROW_NUMBER() OVER (
                        PARTITION BY empresa_id, YEAR(fecha_fin_periodo)
                        ORDER BY
                            fecha_publicacion DESC,
                            id DESC
                    ) AS rn_ejercicio
                FROM informe_financiero
                WHERE fuente = ?
                  AND tipo_periodo = 'ANUAL'
                  AND fecha_fin_periodo IS NOT NULL
            ),
            anuales_unicos AS (
                SELECT id, empresa_id, fecha_fin_periodo
                FROM anuales_rank
                WHERE rn_ejercicio = 1
            ),
            anuales_4 AS (
                SELECT
                    id,
                    empresa_id,
                    fecha_fin_periodo,
                    ROW_NUMBER() OVER (
                        PARTITION BY empresa_id
                        ORDER BY fecha_fin_periodo DESC, id DESC
                    ) AS rn_anual
                FROM anuales_unicos
            ),
            ultimo_anual AS (
                SELECT empresa_id, MAX(fecha_fin_periodo) AS fecha_ultimo_anual
                FROM anuales_4
                WHERE rn_anual <= 4
                GROUP BY empresa_id
            ),
            intermedio_rank AS (
                SELECT
                    i.id,
                    i.empresa_id,
                    ROW_NUMBER() OVER (
                        PARTITION BY i.empresa_id
                        ORDER BY i.fecha_fin_periodo DESC, i.id DESC
                    ) AS rn_intermedio
                FROM informe_financiero i
                LEFT JOIN ultimo_anual ua
                    ON ua.empresa_id = i.empresa_id
                WHERE i.fuente = ?
                  AND i.tipo_periodo <> 'ANUAL'
                  AND i.fecha_fin_periodo IS NOT NULL
                  AND (
                      ua.fecha_ultimo_anual IS NULL
                      OR i.fecha_fin_periodo > ua.fecha_ultimo_anual
                  )
            ),
            conservar AS (
                SELECT id FROM anuales_4 WHERE rn_anual <= 4
                UNION ALL
                SELECT id FROM intermedio_rank WHERE rn_intermedio = 1
            )
            SELECT id FROM conservar
        ) keepers
            ON keepers.id = inf.id
        LEFT JOIN (
            SELECT DISTINCT informe_id
            FROM valuation_input_version
            WHERE informe_id IS NOT NULL

            UNION

            SELECT DISTINCT informe_id
            FROM partida_contable_valor
            WHERE informe_id IS NOT NULL

            UNION

            SELECT DISTINCT informe_id
            FROM kpi_financiero_informe
            WHERE informe_id IS NOT NULL
        ) en_uso
            ON en_uso.informe_id = inf.id
        WHERE inf.fuente = ?
          AND keepers.id IS NULL
          AND en_uso.informe_id IS NULL
        `,
        [fuente, fuente, fuente]
    );

    return Number(resultado?.affectedRows || 0);
}

// ============================================================================
// MOTOR PRINCIPAL - USA
// ============================================================================

export async function ejecutarCargaInformesUSA() {
    const inicio = Date.now();

    console.log("\n==============================================");
    console.log(" INFORME_FINANCIERO - USA / SEC EDGAR");
    console.log("==============================================");

    // -------------------- 1. MAPA SEC --------------------

    const mapaCIK = await descargarMapaCIK();

    // -------------------- 2. EMPRESAS USA --------------------

    const instrumentos = await cargarEmpresasUSA();

    console.log(`[USA] Tickers encontrados en BD: ${instrumentos.length}`);

    // Una empresa puede tener varios tickers.
    // Nos quedamos con el primer ticker que tenga CIK SEC conocido.

    const empresas = new Map<
        number,
        { empresa_id: number; ticker: string; cik: string }
    >();

    for (const instrumento of instrumentos) {
        if (empresas.has(instrumento.empresa_id)) {
            continue;
        }

        const cik = mapaCIK.get(instrumento.ticker);

        if (!cik) {
            continue;
        }

        empresas.set(instrumento.empresa_id, {
            empresa_id: instrumento.empresa_id,
            ticker: instrumento.ticker,
            cik
        });
    }

    console.log(`[USA] Empresas con CIK: ${empresas.size}`);

    // -------------------- 3. DESCARGAR INFORMES --------------------

    let empresasProcesadas = 0;
    let empresasError = 0;
    let totalInformes = 0;
    let totalGuardados = 0;

    for (const empresa of empresas.values()) {
        try {
            const informes = await descargarInformesEmpresa(
                empresa.empresa_id,
                empresa.cik
            );

            const informesObjetivo = seleccionarInformesObjetivo(informes);

            totalInformes += informesObjetivo.length;

            const guardados = await guardarInformes(informesObjetivo);

            totalGuardados += guardados;

            empresasProcesadas++;

            if (empresasProcesadas % 100 === 0) {
                console.log(
                    `[USA] Procesadas ${empresasProcesadas}/${empresas.size} empresas | ` +
                    `informes detectados: ${totalInformes}`
                );
            }
        } catch (error) {
            empresasError++;

            console.error(
                `[SEC] Error ${empresa.ticker} (CIK ${empresa.cik})`
            );
        }

        // ================================================================
        // FAIR ACCESS SEC
        // ================================================================

        await dormir(SEC_INTERVALO_MS);
    }

    // -------------------- RETENCION FINAL --------------------
    const eliminadosRetencion = await aplicarRetencionInformesFuente("SEC_EDGAR");
    console.log(`[USA] Informes eliminados por retencion: ${eliminadosRetencion}`);

    // -------------------- RESUMEN --------------------

    const duracionMs = Date.now() - inicio;

    console.log("\n[USA] RESUMEN FINAL");
    console.log(`- Empresas con CIK: ${empresas.size}`);
    console.log(`- Empresas procesadas: ${empresasProcesadas}`);
    console.log(`- Empresas con error: ${empresasError}`);
    console.log(`- Informes últimos ${ANOS_HISTORICO} años: ${totalInformes}`);
    console.log(`- Operaciones BD: ${totalGuardados}`);
    console.log(`- Tiempo total: ${(duracionMs / 1000).toFixed(1)} s`);

    return {
        empresas: empresas.size,
        empresasProcesadas,
        empresasError,
        informes: totalInformes,
        operacionesBD: totalGuardados,
        duracionMs
    };
}

// ============================================================================
// MOTOR PRINCIPAL - JAPON
// ============================================================================

export async function ejecutarCargaInformesJapon() {
    if (!JP_EDINET_API_KEY) {
        throw new Error("Falta EDINET_API_KEY en el archivo .env");
    }

    const inicio = Date.now();

    console.log("\n==============================================");
    console.log(" INFORME_FINANCIERO - JAPON / EDINET");
    console.log("==============================================");

    // -------------------- 1. EMPRESAS DE NUESTRA BD --------------------

    const mapaEmpresas = await jpCargarEmpresas();

    if (mapaEmpresas.size === 0) {
        console.warn("[JP] No hay empresas japonesas con instrumento.");

        return {
            empresas: 0,
            dias: 0,
            informes: 0,
            operacionesBD: 0,
            errores: 0,
            duracionMs: Date.now() - inicio
        };
    }

    // -------------------- 2. FECHAS --------------------

    const fechas = jpGenerarFechas();

    console.log(`[JP] Dias a consultar: ${fechas.length}`);
    console.log(`[JP] Histórico: ${JP_ANOS_HISTORICO} años`);

    // -------------------- 3. DESCARGA DIA A DIA --------------------

    let diasProcesados = 0;
    let diasError = 0;
    let totalDocumentosEDINET = 0;
    let totalInformes = 0;
    let totalGuardados = 0;

    const idsVistos = new Set<string>();

    for (const fecha of fechas) {
        try {
            const documentos = await jpDescargarDia(fecha);
            totalDocumentosEDINET += documentos.length;

            const informes = jpExtraerInformesDia(documentos, mapaEmpresas);

            // -----------------------------------------------------------
            // Deduplicar por docID
            // -----------------------------------------------------------

            const nuevos = informes.filter(informe => {
                if (idsVistos.has(informe.identificadorFuente)) {
                    return false;
                }

                idsVistos.add(informe.identificadorFuente);
                return true;
            });

            totalInformes += nuevos.length;

            if (nuevos.length > 0) {
                const guardados = await jpGuardarInformes(nuevos);
                totalGuardados += guardados;
            }

            diasProcesados++;

            // -----------------------------------------------------------
            // LOG CADA 30 DIAS
            // -----------------------------------------------------------

            if (diasProcesados % 30 === 0) {
                console.log(
                    `[JP] Dias ${diasProcesados}/${fechas.length} | ` +
                    `docs EDINET: ${totalDocumentosEDINET} | ` +
                    `informes nuestros: ${totalInformes}`
                );
            }
        } catch (error) {
            diasError++;

            console.error(
                `[EDINET] Error fecha ${fecha}:`,
                error instanceof Error ? error.message : String(error)
            );
        }

        // ---------------------------------------------------------------
        // PAUSA ENTRE PETICIONES
        // ---------------------------------------------------------------

        await jpDormir(JP_EDINET_INTERVAL_MS);
    }

    // -------------------- RETENCION FINAL --------------------
    const eliminadosRetencion = await aplicarRetencionInformesFuente("EDINET");
    console.log(`[JP] Informes eliminados por retencion: ${eliminadosRetencion}`);

    // -------------------- RESUMEN --------------------

    const duracionMs = Date.now() - inicio;

    console.log("\n[JP] RESUMEN FINAL");
    console.log(`- Empresas japonesas BD: ${mapaEmpresas.size}`);
    console.log(`- Dias consultados: ${diasProcesados}`);
    console.log(`- Dias con error: ${diasError}`);
    console.log(`- Documentos EDINET revisados: ${totalDocumentosEDINET}`);
    console.log(`- Informes financieros detectados: ${totalInformes}`);
    console.log(`- Operaciones BD: ${totalGuardados}`);
    console.log(`- Tiempo total: ${(duracionMs / 1000).toFixed(1)} s`);

    return {
        empresas: mapaEmpresas.size,
        dias: diasProcesados,
        diasError,
        documentosEDINET: totalDocumentosEDINET,
        informes: totalInformes,
        operacionesBD: totalGuardados,
        duracionMs
    };
}

// ============================================================================
// MOTOR PRINCIPAL - TAIWAN (CONCURRENTE)
//
// N workers toman empresas de una cola compartida. Todos pasan por el mismo
// limitador global (twEsperarTurno), asi que el numero total de peticiones
// por minuto nunca supera TW_RPM, sea cual sea el numero de workers.
// La retencion en BD se aplica UNA vez, cuando todos los workers terminan.
// ============================================================================

export async function ejecutarCargaInformesTaiwan() {
    const inicio = Date.now();

    console.log("\n==============================================");
    console.log(" INFORME_FINANCIERO - TAIWAN / FINMIND");
    console.log("==============================================");

    if (!TW_FINMIND_TOKEN) {
        // Sin token el cupo real de FinMind es 300/hora (~5/min), no el que
        // hayas puesto en FINMIND_TW_RPM (pensado para el limite CON token,
        // 600/hora). Si no se recorta aqui, el proceso choca con el 402 en
        // cuanto se agotan las primeras ~300 peticiones y luego pierde tiempo
        // en bloqueos repetidos hasta que el backoff crece lo suficiente.
        twRpmEfectivo = Math.min(TW_RPM, TW_RPM_SIN_TOKEN);

        console.warn(
            `[TW] FINMIND_TOKEN no configurado. Cupo real de FinMind: 300/hora. ` +
            `Se reduce el ritmo a ${twRpmEfectivo} peticiones/min para no agotarlo. ` +
            `Configura FINMIND_TOKEN en el .env para usar hasta 600/hora.`
        );
    } else {
        twRpmEfectivo = TW_RPM;
    }

    const empresas = await twCargarEmpresas();

    const concurrencia = Math.max(
        1,
        Math.min(TW_CONCURRENCIA, empresas.length || 1)
    );

    console.log(
        `[TW] Workers: ${concurrencia} | limite global: ${twRpmEfectivo} peticiones/min | ` +
        `tiempo minimo estimado: ${Math.ceil(empresas.length / Math.max(1, twRpmEfectivo))} min`
    );

    let procesadas = 0;
    let errores = 0;
    let sinDatos = 0;
    let totalInformes = 0;
    let totalGuardados = 0;
    let completadas = 0;

    // Cola compartida. En Node, `siguiente++` es atomico entre workers
    // (no hay hilos), asi que cada empresa la procesa un unico worker.
    let siguiente = 0;

    const worker = async (idWorker: number): Promise<void> => {
        while (true) {
            const posicion = siguiente++;

            if (posicion >= empresas.length) {
                return;
            }

            const empresa = empresas[posicion];

            try {
                const filas = await twDescargarFinancialStatements(empresa.ticker);

                if (filas.length === 0) {
                    sinDatos++;
                } else {
                    const informes = twExtraerInformes(empresa, filas);
                    const informesObjetivo = seleccionarInformesObjetivo(informes);
                    totalInformes += informesObjetivo.length;
                    totalGuardados += await twGuardarInformes(informesObjetivo);
                }

                procesadas++;
            } catch (error) {
                errores++;

                console.error(
                    `[TW FINMIND] (worker ${idWorker}) Error ${empresa.ticker}:`,
                    error instanceof Error ? error.message : String(error)
                );
            }

            completadas++;

            if (completadas % 50 === 0) {
                console.log(
                    `[TW] Completadas ${completadas}/${empresas.length}` +
                    ` | informes: ${totalInformes}` +
                    ` | sin datos: ${sinDatos}` +
                    ` | errores: ${errores}`
                );
            }
        }
    };

    await Promise.all(
        Array.from({ length: concurrencia }, (_, i) => worker(i + 1))
    );

    const eliminadosRetencion = await aplicarRetencionInformesFuente("FINMIND");
    console.log(`[TW] Informes eliminados por retencion: ${eliminadosRetencion}`);

    const duracionMs = Date.now() - inicio;

    console.log("\n[TW] RESUMEN FINAL");
    console.log(`- Empresas BD: ${empresas.length}`);
    console.log(`- Workers: ${concurrencia}`);
    console.log(`- Procesadas: ${procesadas}`);
    console.log(`- Sin datos: ${sinDatos}`);
    console.log(`- Errores: ${errores}`);
    console.log(`- Informes detectados: ${totalInformes}`);
    console.log(`- Operaciones BD: ${totalGuardados}`);
    console.log(`- Tiempo total: ${(duracionMs / 1000).toFixed(1)} s`);

    return {
        empresas: empresas.length,
        workers: concurrencia,
        procesadas,
        sinDatos,
        errores,
        informes: totalInformes,
        operacionesBD: totalGuardados,
        eliminadosRetencion,
        duracionMs
    };
}

// ============================================================================
// ENDPOINT EXPRESS - USA
// POST /api/informe-financiero/usa/actualizar
// ============================================================================

export async function actualizarInformesFinancierosUSA(
    _req: Request,
    res: Response
): Promise<void> {
    try {
        const resultado = await ejecutarCargaInformesUSA();

        res.status(200).json({
            ok: true,
            mensaje: "Carga de INFORME_FINANCIERO USA finalizada.",
            resumen: resultado
        });
    } catch (error) {
        console.error("[USA INFORMES] ERROR CRITICO:", error);

        res.status(500).json({
            ok: false,
            mensaje: "No se pudo cargar INFORME_FINANCIERO USA.",
            error: error instanceof Error ? error.message : String(error)
        });
    }
}

// ============================================================================
// ENDPOINT EXPRESS - JAPON
// POST /api/informe-financiero/japon/actualizar
// ============================================================================

export async function actualizarInformesFinancierosJapon(
    _req: Request,
    res: Response
): Promise<void> {
    try {
        const resultado = await ejecutarCargaInformesJapon();

        res.status(200).json({
            ok: true,
            mensaje: "Carga de INFORME_FINANCIERO Japón finalizada.",
            resumen: resultado
        });
    } catch (error) {
        console.error("[JP INFORMES] ERROR CRITICO:", error);

        res.status(500).json({
            ok: false,
            mensaje: "No se pudo cargar INFORME_FINANCIERO Japón.",
            error: error instanceof Error ? error.message : String(error)
        });
    }
}

// ============================================================================
// ENDPOINT EXPRESS - TAIWAN
// POST /api/informe-financiero/taiwan/actualizar
// ============================================================================

export async function actualizarInformesFinancierosTaiwan(
    _req: Request,
    res: Response
): Promise<void> {
    try {
        const resultado = await ejecutarCargaInformesTaiwan();

        res.status(200).json({
            ok: true,
            mensaje: "Carga de INFORME_FINANCIERO Taiwan finalizada.",
            resumen: resultado
        });
    } catch (error) {
        console.error("[TW INFORMES] ERROR CRITICO:", error);

        res.status(500).json({
            ok: false,
            mensaje: "No se pudo cargar INFORME_FINANCIERO Taiwan.",
            error: error instanceof Error ? error.message : String(error)
        });
    }
}

// ============================================================================
// EJECUCION DIRECTA
//
// IMPORTANTE:
// NO DEJAR VARIAS ACTIVAS SIMULTANEAMENTE. Descomenta solo el bloque del
// país que quieras ejecutar con:
//
// npx ts-node insercionInformeFinanciero.ts
//
// Mientras pruebas Taiwán: deja USA y Japón comentados (como está ahora).
// El bloque de Taiwán lleva el guard require.main === module: si este archivo
// se importa desde las rutas Express, NO se lanza la carga al importar.
// ============================================================================

// -------------------- USA (comentado) --------------------

// if (require.main === module) {
//     ejecutarCargaInformesUSA()
//         .then(resultado => {
//             console.log("Terminado:", resultado);
//             process.exit(0);
//         })
//         .catch(error => {
//             console.error("Error ejecutando la carga de informes:", error);
//             process.exit(1);
//         });
// }

// -------------------- JAPON (comentado) --------------------

ejecutarCargaInformesJapon()
    .then(resultado => {
        console.log("\n=== INFORME_FINANCIERO JAPON FINALIZADO ===");
        console.log(resultado);
    })
    .catch(error => {
        console.error("\n=== ERROR CRITICO INFORME_FINANCIERO JAPON ===", error);
        process.exitCode = 1;
    });

// -------------------- TAIWAN (activo) --------------------

// if (require.main === module) {
//     ejecutarCargaInformesTaiwan()
//         .then(resultado => {
//             console.log("\n=== INFORME_FINANCIERO TAIWAN FINALIZADO ===");
//             console.log(resultado);
//             process.exit(0);
//         })
//         .catch(error => {
//             console.error("\n=== ERROR CRITICO INFORME_FINANCIERO TAIWAN ===", error);
//             process.exit(1);
//         });
// }
