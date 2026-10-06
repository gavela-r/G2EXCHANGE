import { parse } from "csv-parse/sync";
import * as cheerio from "cheerio";
import { translate } from "@vitalets/google-translate-api";
import pinyin from "pinyin";
import conexion from "../conexion/bd";

// ============================================================================
// CARGA DE INSTRUMENTOS
// Respeta el modelo ER actual:
// instrumento(id, empresa_id, mercado_id, ticker, isin, moneda)
// ============================================================================

// ============================================================================
// 1. TIPOS
// ============================================================================

interface InstrumentoRaw {
    ticker: string;
    nombre_empresa: string;
    isin: string | null;
    mercado_nombre: string;
    moneda: string;
    codigo_pais: "US" | "JP" | "TW";
}

interface EmpresaSEC {
    cik_str: number;
    ticker: string;
    title: string;
}

interface InstrumentoExistente {
    id: number;
    empresa_id: number | null;
    isin: string | null;
}

// ============================================================================
// 2. CONFIGURACIÓN
// ============================================================================

const SEC_USER_AGENT = "SAFIN360 operations@safin360.com";
const TAMANO_LOTE = 1000;

// Pausa entre llamadas a Google Translate para evitar bloqueo por IP.
// Sin esto, Google banea la IP en segundos.
const TRADUCCION_PAUSA_MS = Number(
    process.env.TAIWAN_TRADUCCION_PAUSA_MS || 500
);

// Alias manuales.
// Añade aquí únicamente equivalencias verificadas.
const aliasEmpresas: Record<string, string> = {
    "ALPHABET CLASS A": "ALPHABET",
    "ALPHABET CLASS C": "ALPHABET",
    "BERKSHIRE HATHAWAY CLASS A": "BERKSHIRE HATHAWAY",
    "BERKSHIRE HATHAWAY CLASS B": "BERKSHIRE HATHAWAY",
    "TAIWAN SEMICONDUCTOR MANUFACTURING": "TAIWAN SEMICONDUCTOR"
};

// ============================================================================
// 3. UTILIDADES
// ============================================================================

function normalizarNombre(nombre: string): string {
    if (!nombre) return "";

    return nombre
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toUpperCase()
        .replace(/&/g, " AND ")
        .replace(/[.,'’´`"()\-_/]/g, " ")
        .replace(
            /\b(INCORPORATED|INC|CORPORATION|CORP|LIMITED|LTD|COMPANY|CO|PLC|LLC|LP|HOLDINGS|HOLDING|GROUP|SA|NV|AG|SE|KK)\b/g,
            " "
        )
        .replace(/\s+/g, " ")
        .trim();
}

function aplicarAlias(nombreNormalizado: string): string {
    return aliasEmpresas[nombreNormalizado] || nombreNormalizado;
}

function dividirEnLotes<T>(datos: T[], tamano = TAMANO_LOTE): T[][] {
    const lotes: T[][] = [];

    for (let i = 0; i < datos.length; i += tamano) {
        lotes.push(datos.slice(i, i + tamano));
    }

    return lotes;
}

function normalizarTicker(ticker: unknown): string {
    return String(ticker || "").trim().toUpperCase();
}

function normalizarMercado(mercado: unknown): string {
    return String(mercado || "").trim().toUpperCase();
}

function normalizarNombreMercado(nombre: unknown): string {
    const mercado = normalizarMercado(nombre);

    const equivalencias: Record<string, string> = {
        // Estados Unidos
        "NASDAQ": "NASDAQ STOCK MARKET",
        "NYSE": "NEW YORK STOCK EXCHANGE",
        "NYSE MKT": "NYSE AMERICAN",
        "NYSE AMERICAN": "NYSE AMERICAN",

        // Japón
        "TSE": "TOKYO STOCK EXCHANGE",
        "TOKYO": "TOKYO STOCK EXCHANGE",

        // Taiwán
        "TWSE": "TAIWAN STOCK EXCHANGE",
        "TPEX": "TAIPEI EXCHANGE"
    };

    return equivalencias[mercado] || mercado;
}

function normalizarIsin(isin: unknown): string | null {
    const valor = String(isin || "").trim().toUpperCase();
    return valor.length === 12 ? valor : null;
}

function dormir(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Detecta si el nombre contiene caracteres CJK (chino/japonés), para no
// malgastar llamadas de traducción en nombres que ya vienen en inglés.
function contieneCaracteresChinos(texto: string): boolean {
    return /[\u4e00-\u9fff]/.test(texto);
}

// Traduce un nombre de empresa chino al inglés vía Google Translate.
// Si Google bloquea o falla, cae a una transliteración pinyin como último
// recurso, para que el nombre al menos tenga alguna posibilidad de cruzar
// contra la tabla EMPRESA en vez de quedar sin traducir.
async function traducirNombreChino(nombreOriginal: string): Promise<string> {
    if (!contieneCaracteresChinos(nombreOriginal)) {
        return nombreOriginal;
    }

    try {
        const resultado = await translate(nombreOriginal, { to: "en" });
        const traducido = String(resultado.text || "").trim();
        return traducido || nombreOriginal;
    } catch (error) {
        try {
            const romanizado = pinyin(nombreOriginal, {
                style: pinyin.STYLE_NORMAL
            })
                .map((silaba: any) => silaba[0])
                .join(" ");

            return romanizado || nombreOriginal;
        } catch {
            return nombreOriginal;
        }
    }
}

// ============================================================================
// 4. SEC: NOMBRES OFICIALES DE EMPRESAS DE ESTADOS UNIDOS
// ============================================================================

async function descargarMapaSEC(): Promise<Map<string, string>> {
    const response = await fetch(
        "https://www.sec.gov/files/company_tickers.json",
        {
            headers: {
                "User-Agent": SEC_USER_AGENT,
                "Accept-Encoding": "gzip, deflate"
            }
        }
    );

    if (!response.ok) {
        throw new Error(`SEC respondió HTTP ${response.status}`);
    }

    const data: Record<string, EmpresaSEC> = await response.json();
    const mapa = new Map<string, string>();

    for (const empresa of Object.values(data)) {
        const ticker = normalizarTicker(empresa.ticker);
        const nombre = String(empresa.title || "").trim();

        if (ticker && nombre) {
            mapa.set(ticker, nombre);
        }
    }

    console.log(`[SEC] Empresas descargadas: ${mapa.size}`);
    return mapa;
}

// ============================================================================
// 5. ADANOS: ESTADOS UNIDOS Y JAPÓN
// ============================================================================

async function descargarAdanos(
    pais: "US" | "JP",
    mapaSEC?: Map<string, string>
): Promise<InstrumentoRaw[]> {
    console.log(`[Descarga] Obteniendo datos de Adanos para ${pais}...`);

    // Solo mercados que existen actualmente en la tabla MERCADO.
    // Amplía estas listas cuando añadas nuevas bolsas a la base de datos.
    const permitidosUS = new Set([
        "NASDAQ",
        "NYSE",
        "NYSE MKT",
        "NYSE AMERICAN"
    ]);

    const permitidosJP = new Set([
        "TOKYO",
        "TSE"
    ]);

    const permitidos = pais === "US" ? permitidosUS : permitidosJP;
    const moneda = pais === "US" ? "USD" : "JPY";

    const response = await fetch(
        "https://raw.githubusercontent.com/adanos-software/free-ticker-database/main/data/listings.csv"
    );

    if (!response.ok) {
        throw new Error(`Adanos respondió HTTP ${response.status}`);
    }

    const filas: any[] = parse(await response.text(), {
        columns: true,
        skip_empty_lines: true,
        trim: true
    });

    const datos: InstrumentoRaw[] = [];
    const mercadosEncontrados = new Set<string>();

    let filasPais = 0;
    let descartadosMercado = 0;
    let descartadosSinTicker = 0;

    for (const fila of filas) {
        if (String(fila.country_code || "").toUpperCase() !== pais) {
            continue;
        }

        filasPais++;

        const mercado = normalizarMercado(fila.exchange);
        mercadosEncontrados.add(mercado);

        if (!permitidos.has(mercado)) {
            descartadosMercado++;
            continue;
        }

        const ticker = normalizarTicker(fila.ticker);

        if (!ticker) {
            descartadosSinTicker++;
            continue;
        }

        const nombreFuente = String(fila.name || ticker).trim();

        const nombreEmpresa =
            pais === "US"
                ? mapaSEC?.get(ticker) || nombreFuente
                : nombreFuente;

        datos.push({
            ticker,
            nombre_empresa: nombreEmpresa,
            isin: normalizarIsin(fila.isin),
            mercado_nombre: mercado,
            moneda,
            codigo_pais: pais
        });
    }

    console.log(`[Adanos ${pais}] Filas del país: ${filasPais}`);
    console.log(`[Adanos ${pais}] Mercados encontrados:`, [...mercadosEncontrados]);
    console.log(`[Adanos ${pais}] Descartados por mercado: ${descartadosMercado}`);
    console.log(`[Adanos ${pais}] Descartados sin ticker: ${descartadosSinTicker}`);
    console.log(`[Adanos ${pais}] Registros aceptados: ${datos.length}`);

    return datos;
}

// ============================================================================
// 6. TAIWÁN: FINMIND + ISIN TWSE / TPEx
// El ISIN es OPCIONAL. Si isin.twse.com.tw está bloqueado por geolocalización
// (o cualquier otro motivo), se muestra un warning, se continúa y el ISIN
// queda NULL para esos tickers — ya NO se cancela toda la carga de Taiwán.
// ============================================================================

async function descargarTaiwan(): Promise<InstrumentoRaw[]> {
    console.log("[Descarga] Obteniendo datos de FinMind para TW...");

    // =========================================================================
    // 1. FINMIND - FUENTE PRINCIPAL
    // =========================================================================

    const responseFinMind = await fetch(
        "https://api.finmindtrade.com/api/v4/data?dataset=TaiwanStockInfo"
    );

    if (!responseFinMind.ok) {
        throw new Error(`FinMind respondió HTTP ${responseFinMind.status}`);
    }

    const jsonFinMind: any = await responseFinMind.json();

    if (!Array.isArray(jsonFinMind.data)) {
        throw new Error(
            `FinMind no devolvió un array válido en data. Respuesta: ${JSON.stringify(jsonFinMind).slice(0, 500)}`
        );
    }

    console.log(`[FinMind] Registros recibidos: ${jsonFinMind.data.length}`);
    console.log("[FinMind] Primer registro:", jsonFinMind.data[0]);

    // =========================================================================
    // 2. ISIN TWSE / TPEX (opcional)
    // Antes, si isin.twse.com.tw estaba bloqueado por geolocalización, se
    // lanzaba un error y se cancelaba TODA la carga de Taiwán. Ahora, si
    // falla: mostramos warning, continuamos, y el isin queda NULL.
    // =========================================================================

    const mapaIsin = new Map<string, string>();

    for (const mode of ["2", "4"]) {
        try {
            console.log(`[TWSE ISIN] Intentando strMode=${mode}...`);

            const responseTWSE = await fetch(
                `https://isin.twse.com.tw/isin/e_C_public.jsp?strMode=${mode}`,
                {
                    headers: {
                        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
                        "Accept": "text/html,application/xhtml+xml"
                    }
                }
            );

            if (!responseTWSE.ok) {
                console.warn(
                    `[TWSE ISIN] HTTP ${responseTWSE.status} para strMode=${mode}. ` +
                    `Se continúa sin esos ISIN.`
                );
                continue;
            }

            const html = await responseTWSE.text();
            const $ = cheerio.load(html);

            $("table.line_u tr").each((_, row) => {
                const columnas = $(row).find("td");

                if (columnas.length < 6) {
                    return;
                }

                const codigoYNombre = $(columnas[0]).text().trim();
                const isin = $(columnas[1]).text().trim().toUpperCase();
                const match = codigoYNombre.match(/^([^\s]+)\s+(.+)$/);

                if (match && isin.startsWith("TW") && isin.length === 12) {
                    const ticker = normalizarTicker(match[1]);
                    mapaIsin.set(ticker, isin);
                }
            });

            console.log(`[TWSE ISIN] strMode=${mode} procesado correctamente.`);
        } catch (error) {
            console.warn(`[TWSE ISIN] No se pudo consultar strMode=${mode}.`);
            console.warn("[TWSE ISIN] Se continúa sin ISIN. Esto NO cancela Taiwán.");
        }
    }

    console.log(`[Taiwán] ISIN encontrados: ${mapaIsin.size}`);

    if (mapaIsin.size === 0) {
        console.warn(
            "[Taiwán] No se obtuvieron ISIN. " +
            "Los instrumentos se intentarán cargar igualmente con isin=NULL."
        );
    }

    // =========================================================================
    // 3. TRANSFORMAR LOS DATOS DE FINMIND
    //
    // IMPORTANTE: FinMind devuelve el HISTÓRICO de cada ticker, no solo el
    // registro actual. Un mismo stock_id puede aparecer varias veces con
    // fechas distintas (cambios de categoría de industria, etc.). Si no se
    // deduplica, un mismo ticker puede quedar preparado dos veces como
    // "insert nuevo" y provocar choques de clave primaria al construir la
    // tabla temporal de updates. Nos quedamos con la fila de fecha más
    // reciente por cada (ticker, mercado).
    // =========================================================================

    const candidatosPorClave = new Map<string, {
        ticker: string;
        nombre: string;
        mercadoNombre: "TWSE" | "TPEX";
        fecha: string;
    }>();

    let descartadosMercado = 0;
    let descartadosDatos = 0;
    let totalTWSE = 0;
    let totalTPEX = 0;

    for (const fila of jsonFinMind.data) {
        const tipoMercado = String(fila.type || "").trim().toLowerCase();

        let mercadoNombre: "TWSE" | "TPEX" | null = null;

        if (tipoMercado === "twse") {
            mercadoNombre = "TWSE";
            totalTWSE++;
        } else if (tipoMercado === "tpex") {
            mercadoNombre = "TPEX";
            totalTPEX++;
        } else {
            descartadosMercado++;
            continue;
        }

        const ticker = normalizarTicker(fila.stock_id);
        const nombre = String(fila.stock_name || "").trim();
        const fecha = String(fila.date || "");

        if (!ticker || !nombre) {
            descartadosDatos++;
            continue;
        }

        const clave = `${ticker}|${mercadoNombre}`;
        const actual = candidatosPorClave.get(clave);

        // Nos quedamos con la fila de fecha más reciente por (ticker, mercado).
        if (!actual || fecha > actual.fecha) {
            candidatosPorClave.set(clave, { ticker, nombre, mercadoNombre, fecha });
        }
    }

    const duplicadosDescartados =
        totalTWSE + totalTPEX - candidatosPorClave.size;

    console.log(
        `[Taiwán] Duplicados por histórico descartados: ${duplicadosDescartados}`
    );
    console.log(
        `[Taiwán] Tickers únicos a traducir: ${candidatosPorClave.size}`
    );

    // =========================================================================
    // 3.5. TRADUCCIÓN CHINO -> INGLÉS
    //
    // FinMind devuelve los nombres de empresa en chino (stock_name), lo que
    // impide casi cualquier cruce contra la tabla EMPRESA (que tiene nombres
    // en inglés/latino). Traducimos cada nombre único antes del cruce.
    //
    // - Traducimos solo nombres distintos (varios tickers no comparten
    //   nombre normalmente, pero por seguridad deduplicamos por texto).
    // - Pausa entre llamadas para no ser bloqueados por Google.
    // - Si Google falla, caemos a una transliteración pinyin como último
    //   recurso, en vez de dejar el nombre en chino sin más.
    // =========================================================================

    const nombresUnicos = Array.from(
        new Set(
            Array.from(candidatosPorClave.values()).map(c => c.nombre)
        )
    );

    console.log(
        `[Taiwán] Traduciendo ${nombresUnicos.length} nombres únicos ` +
        `(esto puede tardar varios minutos por el límite de Google)...`
    );

    const mapaTraducciones = new Map<string, string>();

    for (let i = 0; i < nombresUnicos.length; i++) {
        const nombreOriginal = nombresUnicos[i];
        const traducido = await traducirNombreChino(nombreOriginal);
        mapaTraducciones.set(nombreOriginal, traducido);

        if (i > 0 && i % 100 === 0) {
            console.log(
                `[Taiwán] Traducción: ${i}/${nombresUnicos.length} nombres procesados...`
            );
        }

        // Pausa obligatoria: sin esto, Google banea la IP en segundos.
        if (i < nombresUnicos.length - 1) {
            await dormir(TRADUCCION_PAUSA_MS);
        }
    }

    console.log(
        `[Taiwán] Traducción completada: ${mapaTraducciones.size} nombres traducidos.`
    );

    const datos: InstrumentoRaw[] = Array.from(candidatosPorClave.values()).map(
        c => ({
            ticker: c.ticker,
            nombre_empresa: mapaTraducciones.get(c.nombre) || c.nombre,
            // El ISIN deja de ser obligatorio.
            isin: mapaIsin.get(c.ticker) || null,
            mercado_nombre: c.mercadoNombre,
            moneda: "TWD",
            codigo_pais: "TW" as const
        })
    );

    // =========================================================================
    // 4. LOGS
    // =========================================================================

    console.log(`[Taiwán] TWSE detectados: ${totalTWSE}`);
    console.log(`[Taiwán] TPEx detectados: ${totalTPEX}`);
    console.log(`[Taiwán] Descartados por mercado: ${descartadosMercado}`);
    console.log(`[Taiwán] Descartados por datos incompletos: ${descartadosDatos}`);
    console.log(`[Taiwán] Registros aceptados (únicos): ${datos.length}`);

    return datos;
}

// ============================================================================
// 7. MOTOR PRINCIPAL
// ============================================================================

export async function ejecutarCargaInstrumentos(): Promise<void> {
    const db = conexion as any;

    console.log("=== INICIANDO CARGA DE INSTRUMENTOS ===");

    try {
        // --------------------------------------------------------------------
        // A. PAÍSES
        // --------------------------------------------------------------------
        const [paisesRaw]: any = await db.query(
            "SELECT id, nombre_pais FROM pais"
        );

        const mapaPais = new Map<string, number>();

        for (const pais of paisesRaw) {
            const nombre = String(pais.nombre_pais || "")
                .normalize("NFD")
                .replace(/[\u0300-\u036f]/g, "")
                .toUpperCase()
                .trim();

            if (
                nombre.includes("ESTADOS UNIDOS") ||
                nombre === "US" ||
                nombre === "USA"
            ) {
                mapaPais.set("US", pais.id);
            }

            if (nombre.includes("JAPON") || nombre === "JP") {
                mapaPais.set("JP", pais.id);
            }

            if (nombre.includes("TAIWAN") || nombre === "TW") {
                mapaPais.set("TW", pais.id);
            }
        }

        console.log("[BD] Países detectados:", Object.fromEntries(mapaPais));

        // --------------------------------------------------------------------
        // B. MERCADOS
        // --------------------------------------------------------------------
        const [mercadosRaw]: any = await db.query(
            "SELECT id, nombre_bolsa FROM mercado"
        );

        const mapaMercados = new Map<string, number>();

        for (const mercado of mercadosRaw) {
            const nombreMercado = normalizarMercado(mercado.nombre_bolsa);

            if (nombreMercado) {
                mapaMercados.set(nombreMercado, mercado.id);
            }
        }

        console.log(
            "[BD] Mercados detectados:",
            Object.fromEntries(mapaMercados)
        );

        // --------------------------------------------------------------------
        // C. EMPRESAS
        // --------------------------------------------------------------------
        const [empresasRaw]: any = await db.query(
            "SELECT id, nombre_empresa, pais_id FROM empresa"
        );

        const mapaEmpresas = new Map<string, number[]>();

        for (const empresa of empresasRaw) {
            const nombreNormalizado = aplicarAlias(
                normalizarNombre(String(empresa.nombre_empresa || ""))
            );

            if (!nombreNormalizado) {
                continue;
            }

            const clave = `${empresa.pais_id}|${nombreNormalizado}`;
            const ids = mapaEmpresas.get(clave) || [];
            ids.push(empresa.id);
            mapaEmpresas.set(clave, ids);
        }

        console.log(`[BD] Empresas cargadas en memoria: ${empresasRaw.length}`);
        console.log(`[BD] Claves normalizadas de empresa: ${mapaEmpresas.size}`);

        // --------------------------------------------------------------------
        // D. INSTRUMENTOS EXISTENTES
        // --------------------------------------------------------------------
        const [instrumentosRaw]: any = await db.query(`
            SELECT id, ticker, mercado_id, empresa_id, isin
            FROM instrumento
        `);

        const mapaInstrumentos = new Map<string, InstrumentoExistente>();

        for (const instrumento of instrumentosRaw) {
            const ticker = normalizarTicker(instrumento.ticker);

            mapaInstrumentos.set(
                `${ticker}|${instrumento.mercado_id}`,
                {
                    id: instrumento.id,
                    empresa_id: instrumento.empresa_id,
                    isin: instrumento.isin
                }
            );
        }

        console.log(
            `[BD] Instrumentos existentes cargados: ${mapaInstrumentos.size}`
        );

        // --------------------------------------------------------------------
        // E. SEC
        // --------------------------------------------------------------------
        let mapaSEC = new Map<string, string>();

        try {
            mapaSEC = await descargarMapaSEC();
        } catch (error) {
            console.error(
                "[SEC] No se pudo descargar el mapa. Se continuará con nombres de Adanos:",
                error
            );
        }

        const cargas: Array<{
            pais: "US" | "JP" | "TW";
            funcion: () => Promise<InstrumentoRaw[]>;
        }> = [
            {
                pais: "US",
                funcion: () => descargarAdanos("US", mapaSEC)
            },
            {
                pais: "JP",
                funcion: () => descargarAdanos("JP")
            },
            {
                pais: "TW",
                funcion: () => descargarTaiwan()
            }
        ];

        // --------------------------------------------------------------------
        // F. PROCESAR
        // --------------------------------------------------------------------
        for (const carga of cargas) {
            console.log(`\n=== PROCESANDO ${carga.pais} ===`);

            let datos: InstrumentoRaw[];

            try {
                datos = await carga.funcion();
            } catch (error) {
                console.error(
                    `[Error] No se pudo descargar ${carga.pais}. No se modifica la base de datos:`,
                    error
                );
                continue;
            }

            if (datos.length === 0) {
                console.warn(
                    `[Aviso] ${carga.pais} devolvió cero registros. No se modifica la base de datos.`
                );
                continue;
            }

            const paisIdBD = mapaPais.get(carga.pais);

            if (!paisIdBD) {
                console.error(
                    `[Error] No se encontró ${carga.pais} en PAIS. Se omite el país completo.`
                );
                continue;
            }

            const inserts: any[][] = [];
            const updates: any[][] = [];

            let descartadosMercado = 0;
            let descartadosEmpresa = 0;
            let ambiguosEmpresa = 0;
            let empresasEnlazadas = 0;
            let ejemplosSinCruce = 0;

            for (const item of datos) {
                const nombreMercadoBD = normalizarNombreMercado(
                    item.mercado_nombre
                );

                const mercadoId = mapaMercados.get(nombreMercadoBD);

                if (!mercadoId) {
                    descartadosMercado++;

                    if (descartadosMercado <= 10) {
                        console.log("[SIN MERCADO]", {
                            ticker: item.ticker,
                            mercadoFuente: item.mercado_nombre,
                            mercadoBuscadoEnBD: nombreMercadoBD
                        });
                    }

                    continue;
                }

                const claveInstrumento = `${item.ticker}|${mercadoId}`;
                const existente = mapaInstrumentos.get(claveInstrumento);

                // Conserva empresa_id si el instrumento ya está enlazado.
                let empresaId: number | null =
                    existente?.empresa_id || null;

                let nombreNormalizado = "";

                if (!empresaId) {
                    nombreNormalizado = aplicarAlias(
                        normalizarNombre(item.nombre_empresa)
                    );

                    const coincidencias =
                        mapaEmpresas.get(
                            `${paisIdBD}|${nombreNormalizado}`
                        ) || [];

                    if (coincidencias.length === 1) {
                        empresaId = coincidencias[0];
                    } else if (coincidencias.length > 1) {
                        ambiguosEmpresa++;

                        if (ambiguosEmpresa <= 20) {
                            console.warn("[AMBIGUO]", {
                                ticker: item.ticker,
                                nombreFuente: item.nombre_empresa,
                                nombreNormalizado,
                                coincidencias
                            });
                        }
                    }
                }

                if (!empresaId) {
                    descartadosEmpresa++;

                    if (ejemplosSinCruce < 30) {
                        ejemplosSinCruce++;

                        console.log("[SIN CRUCE]", {
                            ticker: item.ticker,
                            nombreFuente: item.nombre_empresa,
                            nombreNormalizado:
                                nombreNormalizado ||
                                aplicarAlias(
                                    normalizarNombre(item.nombre_empresa)
                                ),
                            pais: carga.pais,
                            paisIdBD
                        });
                    }

                    continue;
                }

                empresasEnlazadas++;

                if (existente) {
                    updates.push([
                        empresaId,
                        item.isin,
                        item.moneda,
                        existente.id
                    ]);
                } else {
                    inserts.push([
                        empresaId,
                        mercadoId,
                        item.ticker,
                        item.isin,
                        item.moneda
                    ]);

                    mapaInstrumentos.set(claveInstrumento, {
                        id: -1,
                        empresa_id: empresaId,
                        isin: item.isin
                    });
                }
            }

            console.log(`\n[${carga.pais}] RESUMEN FINAL`);
            console.log(`- Descargados: ${datos.length}`);
            console.log(`- Sin mercado en BD: ${descartadosMercado}`);
            console.log(`- Sin empresa coincidente: ${descartadosEmpresa}`);
            console.log(`- Empresas ambiguas: ${ambiguosEmpresa}`);
            console.log(`- Empresas enlazadas: ${empresasEnlazadas}`);
            console.log(`- Inserts preparados: ${inserts.length}`);
            console.log(`- Updates preparados: ${updates.length}`);

            if (inserts.length === 0 && updates.length === 0) {
                console.warn(
                    `[Aviso] ${carga.pais} no produjo cambios. Revisa los logs [SIN MERCADO] y [SIN CRUCE].`
                );
                continue;
            }

            const connection = await db.getConnection();

            try {
                await connection.beginTransaction();

                if (inserts.length > 0) {
                    for (const lote of dividirEnLotes(inserts)) {
                        await connection.query(
                            `INSERT INTO instrumento
                                            (empresa_id, mercado_id, ticker, isin, moneda)
                                            VALUES ?
                                            ON DUPLICATE KEY UPDATE
                                                empresa_id = VALUES(empresa_id),
                                                isin = VALUES(isin),
                                                moneda = VALUES(moneda)`,
                            [lote]
                        );
                    }

                    console.log(
                        `[BD] Insertados/actualizados ${inserts.length} instrumentos de ${carga.pais}.`
                    );
                }

                if (updates.length > 0) {
                    await connection.query(
                        "DROP TEMPORARY TABLE IF EXISTS temp_upd"
                    );

                    await connection.query(`
                        CREATE TEMPORARY TABLE temp_upd (
                            e INT,
                            isin VARCHAR(12),
                            mon VARCHAR(10),
                            id INT PRIMARY KEY
                        )
                    `);

                    for (const lote of dividirEnLotes(updates)) {
                        await connection.query(
                            `INSERT INTO temp_upd (e, isin, mon, id)
                             VALUES ?`,
                            [lote]
                        );
                    }

                    await connection.query(`
                        UPDATE instrumento i
                        JOIN temp_upd t ON i.id = t.id
                        SET
                            i.empresa_id = COALESCE(t.e, i.empresa_id),
                            i.isin = COALESCE(t.isin, i.isin),
                            i.moneda = COALESCE(t.mon, i.moneda)
                    `);

                    console.log(
                        `[BD] Actualizados ${updates.length} instrumentos de ${carga.pais}.`
                    );
                }

                await connection.commit();

            } catch (error) {
                try {
                    await connection.rollback();
                } catch (rollbackError) {
                    console.error(
                        `[Error] También falló el rollback de ${carga.pais}:`,
                        rollbackError
                    );
                }

                console.error(
                    `[Error] Fallo transaccional en ${carga.pais}:`,
                    error
                );

            } finally {
                connection.release();
            }
        }

    } catch (error) {
        console.error("ERROR CRÍTICO:", error);

    } finally {
        console.log("\n=== PROCESO FINALIZADO ===");
    }
}

// Descomenta esta línea para ejecutar directamente.
ejecutarCargaInstrumentos();