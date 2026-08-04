import { parse } from "csv-parse/sync";
import * as cheerio from "cheerio";
import conexion from "../conexion/bd";

// ============================================================================
// 1. UTILIDADES DE NORMALIZACIÓN Y LOTES
// ============================================================================
function normalizarNombre(nombre: string): string {
    if (!nombre) return "";
    let n = nombre.toUpperCase().replace(/[.,'´`\-]/g, "");
    n = n.replace(/\b(INC|CORP|LTD|PLC|CO|CORPORATION|LIMITED|COMPANY|LLC|LP|SA|NV|AG)\b/g, "");
    return n.replace(/\s+/g, " ").trim();
}

function dividirEnLotes<T>(datos: T[], tamano = 1000): T[][] {
    const lotes: T[][] = [];
    for (let i = 0; i < datos.length; i += tamano) {
        lotes.push(datos.slice(i, i + tamano));
    }
    return lotes;
}

interface InstrumentoRaw {
    ticker: string;
    nombre_empresa: string;
    isin: string | null;
    mercado_nombre: string;
    moneda: string;
    codigo_pais: string;
}

// ============================================================================
// 2. PROVEEDORES DE DATOS (EN MEMORIA)
// ============================================================================
async function descargarAdanos(pais: "US" | "JP"): Promise<InstrumentoRaw[]> {
    console.log(`[Descarga] Obteniendo datos de Adanos para ${pais}...`);
    const datos: InstrumentoRaw[] = [];
    const permitidosUS = ["NASDAQ", "NYSE", "NYSE ARCA", "NYSE MKT", "NYSE AMERICAN", "BATS", "IEX"];
    const permitidosJP = ["TOKYO", "TSE", "NAGOYA", "FUKUOKA", "SAPPORO"];
    const permitidos = pais === "US" ? permitidosUS : permitidosJP;
    const moneda = pais === "US" ? "USD" : "JPY";

    try {
        const res = await fetch("https://raw.githubusercontent.com/adanos-software/free-ticker-database/main/data/listings.csv");
        if (!res.ok) throw new Error(`Adanos respondió HTTP ${res.status}`);
        const filas = parse(await res.text(), { columns: true, skip_empty_lines: true, trim: true }) as Record<string, any>[];

        for (const f of filas) {
            if (f.country_code?.toUpperCase() !== pais) continue;
            const exchange = (f.exchange || "").toUpperCase();
            if (!permitidos.includes(exchange)) continue;

            datos.push({
                ticker: f.ticker,
                nombre_empresa: f.name || f.ticker,
                isin: f.isin?.length === 12 ? f.isin : null,
                mercado_nombre: exchange,
                moneda: moneda,
                codigo_pais: pais
            });
        }
    } catch (error) {
        console.error(`[Error] Fallo al descargar Adanos ${pais}:`, error);
    }
    return datos;
}

async function descargarTaiwan(): Promise<InstrumentoRaw[]> {
    console.log(`[Descarga] Obteniendo datos de FinMind y TWSE para TW...`);
    const datos: InstrumentoRaw[] = [];
    
    try {
        const resFM = await fetch("https://api.finmindtrade.com/api/v4/data?dataset=TaiwanStockInfo");
        if (!resFM.ok) {
            throw new Error(`FinMind respondió HTTP ${resFM.status}`);
        }
        const jsonFM = await resFM.json();
        const dataFM = jsonFM.data || [];

        const mapIsin = new Map<string, string>();
        for (const mode of ['2', '4']) {
            const res = await fetch(`https://isin.twse.com.tw/isin/e_C_public.jsp?strMode=${mode}`);
            if (!res.ok) {
                throw new Error(`TWSE respondió HTTP ${res.status} para strMode=${mode}`);
            }
            const $ = cheerio.load(await res.text());
            $("table.line_u tr").each((_, row) => {
                const cols = $(row).find("td");
                if (cols.length >= 6) {
                    const match = $(cols[0]).text().trim().match(/^([^\s]+)\s+(.+)$/);
                    const isin = $(cols[1]).text().trim();
                    if (match && isin.startsWith("TW")) mapIsin.set(match[1], isin);
                }
            });
        }

        for (const c of dataFM) {
            const mercadoNombre = c.type === "twse" ? "TWSE" : (c.type === "tpex" ? "TPEX" : null);
            if (!mercadoNombre) continue;

            datos.push({
                ticker: c.stock_id,
                nombre_empresa: c.stock_name,
                isin: mapIsin.get(c.stock_id) || null,
                mercado_nombre: mercadoNombre,
                moneda: "TWD",
                codigo_pais: "TW"
            });
        }
    } catch (error) {
        console.error("[Error] Fallo al descargar Taiwán:", error);
    }
    return datos;
}

// ============================================================================
// 3. MOTOR DE CRUCE Y VOLCADO (CONECTADO A TU MÓDULO)
// ============================================================================
async function ejecutarCarga() {
    const db = conexion as any;
    console.log("=== INICIANDO CARGA DE INSTRUMENTOS ===");

    try {
        // 1. Cargar estado de la base de datos en memoria
        console.log("[Memoria] Cargando diccionarios desde la base de datos...");
        
        const [paisesRaw]: any = await db.query("SELECT id, nombre_pais FROM pais");
        const mapaPais = new Map<string, number>();
        paisesRaw.forEach((p: any) => {
            const n = p.nombre_pais.toUpperCase();
            if (n.includes("ESTADOS UNIDOS") || n === "US" || n === "USA") mapaPais.set("US", p.id);
            if (n.includes("JAPON") || n.includes("JAPÓN") || n === "JP") mapaPais.set("JP", p.id);
            if (n.includes("TAIWAN") || n.includes("TAIWÁN") || n === "TW") mapaPais.set("TW", p.id);
        });

        const [mercadosRaw]: any = await db.query("SELECT id, nombre_bolsa FROM mercado");
        const mapaMercados = new Map<string, number>();
        mercadosRaw.forEach((m: any) => mapaMercados.set(m.nombre_bolsa.toUpperCase(), m.id));

        // CORRECCIÓN 2: Guardar arrays para detectar ambigüedades de nombres normalizados
        const [empresasRaw]: any = await db.query("SELECT id, nombre_empresa, pais_id FROM empresa");
        const mapaEmpresas = new Map<string, number[]>();
        empresasRaw.forEach((e: any) => {
            const norm = normalizarNombre(e.nombre_empresa);
            const clave = `${e.pais_id}|${norm}`;
            if (!mapaEmpresas.has(clave)) {
                mapaEmpresas.set(clave, []);
            }
            mapaEmpresas.get(clave)!.push(e.id);
        });

        const [instrumentosRaw]: any = await db.query("SELECT id, ticker, mercado_id, isin FROM instrumento");
        const mapaInstrumentos = new Map<string, { id: number, isin: string | null }>();
        instrumentosRaw.forEach((i: any) => {
            mapaInstrumentos.set(`${i.ticker}|${i.mercado_id}`, { id: i.id, isin: i.isin });
        });

        const cargas = [
            { pais: "US", funcion: () => descargarAdanos("US") },
            { pais: "JP", funcion: () => descargarAdanos("JP") },
            { pais: "TW", funcion: () => descargarTaiwan() }
        ];

        for (const carga of cargas) {
            console.log(`\n=== PROCESANDO ${carga.pais} ===`);
            const datos = await carga.funcion();
            const paisIdBD = mapaPais.get(carga.pais);

            if (!paisIdBD) {
                console.warn(`[Aviso] No se encontró el ID del país ${carga.pais} en la tabla PAIS.`);
            }

            const inserts: any[][] = [];
            const updates: any[][] = [];

            for (const item of datos) {
                const mercadoId = mapaMercados.get(item.mercado_nombre.toUpperCase());
                if (!mercadoId) continue;

                // CORRECCIÓN 2: Asignar empresa solo si hay una coincidencia única
                let empresaId: number | null = null;
                if (paisIdBD) {
                    const norm = normalizarNombre(item.nombre_empresa);
                    const coincidencias = mapaEmpresas.get(`${paisIdBD}|${norm}`) || [];
                    if (coincidencias.length === 1) {
                        empresaId = coincidencias[0];
                    }
                }

                // CORRECCIÓN 3: Omitir instrumentos que no encuentren una empresa única
                if (!empresaId) {
                    console.warn(`[Aviso] Empresa no encontrada o ambigua: ${item.nombre_empresa} (${item.ticker}, ${carga.pais})`);
                    continue;
                }

                const claveInst = `${item.ticker}|${mercadoId}`;
                const existente = mapaInstrumentos.get(claveInst);

                if (existente) {
                    const isinFinal = item.isin ? item.isin : existente.isin;
                    updates.push([empresaId, isinFinal, item.moneda, existente.id]);
                } else {
                    inserts.push([empresaId, mercadoId, item.ticker, item.isin, item.moneda]);
                    mapaInstrumentos.set(claveInst, { id: -1, isin: item.isin });
                }
            }

            // 4. Volcar a base de datos usando transacciones y lotes
            const connection = await db.getConnection();
            await connection.beginTransaction();
            try {
                if (inserts.length > 0) {
                    for (const lote of dividirEnLotes(inserts, 1000)) {
                        await connection.query(
                            `INSERT INTO instrumento (empresa_id, mercado_id, ticker, isin, moneda) VALUES ?`,
                            [lote]
                        );
                    }
                    console.log(`[BD] Insertados ${inserts.length} nuevos instrumentos.`);
                }

                if (updates.length > 0) {
                    await connection.query(`CREATE TEMPORARY TABLE temp_upd (e INT, isin VARCHAR(12), mon VARCHAR(10), id INT)`);
                    for (const lote of dividirEnLotes(updates, 1000)) {
                        await connection.query(`INSERT INTO temp_upd VALUES ?`, [lote]);
                    }
                    // CORRECCIÓN 1: Uso de COALESCE para evitar sobrescribir empresa_id con NULL por error
                    await connection.query(`
                        UPDATE instrumento i 
                        JOIN temp_upd t ON i.id = t.id 
                        SET 
                            i.empresa_id = COALESCE(t.e, i.empresa_id),
                            i.isin = COALESCE(t.isin, i.isin),
                            i.moneda = t.mon
                    `);
                    await connection.query(`DROP TEMPORARY TABLE temp_upd`);
                    console.log(`[BD] Actualizados ${updates.length} instrumentos existentes.`);
                }

                await connection.commit();
                connection.release();
            } catch (err) {
                await connection.rollback();
                connection.release();
                console.error(`[Error] Fallo transaccional en ${carga.pais}:`, err);
            }
        }

    } catch (error) {
        console.error("ERROR CRÍTICO:", error);
    } finally {
        console.log("\n=== PROCESO FINALIZADO ===");
    }
}

// Iniciar ejecución
ejecutarCarga();