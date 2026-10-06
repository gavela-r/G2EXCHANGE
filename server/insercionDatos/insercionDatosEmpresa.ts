import conexion from "../conexion/bd";
import { normalizarSectorJP, normalizarSectorTW } from "./insercionDatosSector"; 
import { translate } from "@vitalets/google-translate-api";
import pinyin from "pinyin";

interface Empresa {
    ticker: string;
    name: string;
    country: string; // US, JP, TW
    sector: string;
}

/* ============================================================
   USA (SEC + Finnhub)
   ============================================================ */

async function getEmpresasUSA(): Promise<Empresa[]> {
    console.log("== EEUU: descargando listado SEC ==");

    const res = await fetch("https://www.sec.gov/files/company_tickers.json", {
        headers: { "User-Agent": "Mozilla/5.0" }
    });

    const data = await res.json() as Record<string, { ticker: string; title: string }>;
    const base = Object.values(data);

    const out: Empresa[] = [];

    for (let i = 0; i < base.length; i++) {
        const { ticker, title } = base[i];
        let sector = "N/A";

        try {
            const r = await fetch(
                `https://finnhub.io/api/v1/stock/profile2?symbol=${ticker}&token=d9ktkghr01qshkro93ggd9ktkghr01qshkro93h0`
            );
            const profile = await r.json();
            if (profile?.finnhubIndustry) sector = profile.finnhubIndustry;
        } catch {}

        out.push({
            ticker,
            name: title,
            country: "US",
            sector
        });

        if (i % 200 === 0) console.log(`  EEUU ${i}/${base.length}`);
    }

    return out;
}


/* ============================================================
   TAIWÁN (TWSE)
   ============================================================ */

async function getEmpresasTaiwan(): Promise<Empresa[]> {
    console.log("== Taiwán: descargando listado desde API FinMind ==");

    // FinMind TaiwanStockInfo trae toda la lista de acciones
    const url = "https://api.finmindtrade.com/api/v4/data?dataset=TaiwanStockInfo";

    try {
        const res = await fetch(url);

        if (!res.ok) {
            console.error(`  Error FinMind: ${res.status}. Saltando Taiwán por ahora.`);
            return [];
        }

        const json = await res.json();
        
        // La API de FinMind devuelve los datos dentro de un array llamado "data"
        const data = json.data || [];
        const out: Empresa[] = [];

        console.log(`  Procesando y traduciendo empresas de Taiwán (Esto tardará unos minutos por límite de Google)...`);

        for (let i = 0; i < data.length; i++) {
            const c = data[i];
            
            // FinMind devuelve "twse" (Listed) y "tpex" (OTC). Nos quedamos con la bolsa principal.
            if (c.type !== "twse") continue;

            const ticker = c.stock_id;
            const nombreLocal = c.stock_name;
            const sector = c.industry_category || "N/A";

            if (!ticker || !nombreLocal) continue;

            let nombreFinal = nombreLocal;

            // 1. Intentamos traducir con Google Translate (hacia el inglés 'en' o el idioma que prefieras)
            try {
                const traduccion = await translate(nombreLocal, { to: 'en' });
                nombreFinal = traduccion.text;
            } catch (error) {
                // 2. Si Google bloquea la IP por límite de uso, entra Pinyin al rescate
                nombreFinal = pinyin(nombreLocal, { style: pinyin.STYLE_NORMAL }).map((x: any) => x[0]).join(" ");
            }

            out.push({
                ticker: String(ticker).trim(),
                name: nombreFinal, 
                country: "TW",
                sector: String(sector).trim()
            });

            // PAUSA OBLIGATORIA DE 500ms: Sin esto, Google Translate te banea en segundos.
            await new Promise(resolve => setTimeout(resolve, 500));
            
            // Log para que veas que no se ha colgado
            if (i > 0 && i % 100 === 0) console.log(`  Taiwán: ${i}/${data.length} empresas procesadas...`);
        }

        console.log(`  Taiwán: ${out.length} empresas guardadas con éxito.`);
        return out;

    } catch (error) {
        console.error("  Fallo al descargar Taiwán desde FinMind.", error);
        console.log("  Continuando con el resto del script...");
        return [];
    }
}




/* ============================================================
   JAPÓN (EDINET)
   ============================================================ */

 async function getEmpresasJapon(): Promise<Empresa[]> {
    console.log("== Japón: descargando listado EDINET/JPX ==");

    const res = await fetch(
        "https://raw.githubusercontent.com/code4fukui/EDINET/main/data/edinetcode.csv"
    );
    const text = await res.text();

    const filas = text.trim().split("\n").slice(2)
        .map(linea => linea.split(",").map(celda => celda.replace(/^"|"$/g, "").trim()));

    const out: Empresa[] = [];

    for (const fila of filas) {
        const [
            ,               // 0 EDINETコード
            ,               // 1 提出者種別
            upperListado,   // 2 上場区分
            ,               // 3 連結の有無
            ,               // 4 資本金
            ,               // 5 決算日
            ,               // 6 提出者名
            nombreIngles,   // 7 提出者名（英字）
            ,               // 8 提出者名（ヨミ）
            ,               // 9 所在地
            sector,         // 10 提出者業種
            ticker,         // 11 証券コード
            ,               // 12 提出者法人番号
        ] = fila;

        if (upperListado !== "上場" || !ticker) continue;

        out.push({
            ticker,
            name: nombreIngles || "N/A",
            country: "JP",
            sector: sector || "N/A"
        });
    }

    console.log(`  Japón: ${out.length} empresas`);
    return out;
}

/* ============================================================
   HELPERS BD
   ============================================================ */

export async function getPaisId(codigoIso: string): Promise<number | null> {
    const [rows]: any = await (conexion as any).query(
        "SELECT id FROM pais WHERE codigo_iso = ?",
        [codigoIso]
    );
    return rows[0]?.id ?? null;
}

export async function getSectorId(nombreSector: string): Promise<number | null> {
    const [rows]: any = await (conexion as any).query(
        "SELECT id FROM sector WHERE nombre_sector = ?",
        [nombreSector]
    );
    return rows[0]?.id ?? null;
}

/* ============================================================
   INSERTAR EMPRESAS
   ============================================================ */

async function poblarEmpresas() {

    console.log("Descargando empresas USA...");
    const usa = await getEmpresasUSA();

    console.log("Descargando empresas Japón...");
    const jp = await getEmpresasJapon();

    console.log("Descargando empresas Taiwán...");
    const tw = await getEmpresasTaiwan();

    const todas = [ ...tw];

    console.log(`Insertando ${todas.length} empresas...`);

    for (const e of todas) {

        let sectorNormalizado = e.sector;

        // ⭐ NORMALIZACIÓN JAPÓN
        if (e.country === "JP") {
            sectorNormalizado = normalizarSectorJP(e.sector);
        }

        // ⭐ NORMALIZACIÓN TAIWÁN
        if (e.country === "TW") {
            sectorNormalizado = normalizarSectorTW(e.sector);
        }

        // USA ya viene normalizado desde Finnhub

        const paisId = await getPaisId(e.country);
        const sectorId = await getSectorId(sectorNormalizado);

        if (!paisId || !sectorId) {
            console.log(`Saltando empresa ${e.name} (paisId=${paisId}, sectorId=${sectorId})`);
            continue;
        }

        await (conexion as any).query(
            `INSERT INTO empresa (nombre_empresa, pais_id, sector_id)
             VALUES (?, ?, ?)
             ON DUPLICATE KEY UPDATE nombre_empresa = VALUES(nombre_empresa)`,
            [e.name, paisId, sectorId]
        );

        console.log(`Empresa insertada: ${e.name}`);
    }

    console.log("Población completa.");
}


async function limpiarEmpresasDuplicadas() {
    const db = conexion as any;

    // 1. Encontrar grupos duplicados: mismo nombre + mismo país
    const [grupos]: any = await db.query(`
        SELECT nombre_empresa, pais_id, COUNT(*) AS total
        FROM empresa
        GROUP BY nombre_empresa, pais_id
        HAVING COUNT(*) > 1
    `);

    console.log(`Grupos duplicados encontrados: ${grupos.length}`);

    let totalFusionadas = 0;
    let totalEliminadas = 0;

    for (const grupo of grupos) {
        const connection = await db.getConnection();

        try {
            await connection.beginTransaction();

            // 2. Traer todos los ids de ese grupo, ordenados (el menor será el "canónico")
            const [filas]: any = await connection.query(
                `SELECT id FROM empresa WHERE nombre_empresa = ? AND pais_id = ? ORDER BY id ASC`,
                [grupo.nombre_empresa, grupo.pais_id]
            );

            const idCanonico = filas[0].id;
            const idsDuplicados = filas.slice(1).map((f: any) => f.id);

            if (idsDuplicados.length === 0) {
                await connection.commit();
                connection.release();
                continue;
            }

            // 3. Reasignar cualquier instrumento que apunte a los duplicados
            await connection.query(
                `UPDATE instrumento SET empresa_id = ? WHERE empresa_id IN (?)`,
                [idCanonico, idsDuplicados]
            );

            // ⚠️ IMPORTANTE: si tienes OTRAS tablas que también referencian
            // empresa.id (ej. noticias, ratios financieros, etc.), añade aquí
            // el mismo UPDATE para cada una antes de borrar.

            // 4. Borrar las filas duplicadas, ya sin referencias
            await connection.query(
                `DELETE FROM empresa WHERE id IN (?)`,
                [idsDuplicados]
            );

            await connection.commit();

            totalFusionadas++;
            totalEliminadas += idsDuplicados.length;

            console.log(
                `[OK] "${grupo.nombre_empresa}" (país ${grupo.pais_id}): mantenido id=${idCanonico}, eliminados=[${idsDuplicados.join(", ")}]`
            );
        } catch (error) {
            await connection.rollback();
            console.error(
                `[ERROR] Fallo procesando "${grupo.nombre_empresa}":`,
                error
            );
        } finally {
            connection.release();
        }
    }

    console.log(`\n=== RESUMEN ===`);
    console.log(`Grupos fusionados: ${totalFusionadas}`);
    console.log(`Filas de empresa eliminadas: ${totalEliminadas}`);
}

limpiarEmpresasDuplicadas();

poblarEmpresas();



