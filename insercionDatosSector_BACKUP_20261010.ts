import conexion from "../conexion/bd";
import * as XLSX from "xlsx";

interface EmpresaSEC {
    cick_str: number;
    ticker: string;
    title: string;
}

// Sectores propios (los que guardas en tu tabla `sector`) que no tienen
// una industria equivalente 1:1 en Damodaran. Para estos, en vez de
// dejarlos en NULL, calculamos una beta aproximada como media de los
// sectores de Damodaran más cercanos.
const SECTOR_DAMODARAN_FALLBACK: Record<string, string[]> = {
    // Communications es demasiado amplio para mapearlo a un único sector de Damodaran.
    "COMMUNICATIONS": [
        "Telecom (Wireless)",
        "Telecom. Services"
    ],
    // Life Sciences Tools & Services: aproximación con sectores sanitarios/biotech relacionados.
    "LIFE SCIENCES TOOLS & SERVICES": [
        "Healthcare Products",
        "Drugs (Biotechnology)",
        "Drugs (Pharmaceutical)"
    ],
    // Infraestructura de transporte: usamos las dos categorías más cercanas.
    "TRANSPORTATION INFRASTRUCTURE": [
        "Transportation",
        "Transportation (Railroads)"
    ],
    // Building es demasiado genérico.
    "BUILDING": [
        "Building Materials",
        "Engineering/Construction",
        "Homebuilding"
    ],
    // Sin equivalencia sectorial válida: usamos el mercado total como referencia.
    "N/A": [
        "Total Market"
    ]
};

/* ============================================================
   PARSER CSV ROBUSTO (SIN DEPENDENCIAS)
   ============================================================ */

function parseCSV(text: string): string[][] {
    const rows: string[][] = [];
    let current = "";
    let row: string[] = [];
    let insideQuotes = false;

    for (let i = 0; i < text.length; i++) {
        const char = text[i];
        const next = text[i + 1];

        if (char === '"' && insideQuotes && next === '"') {
            current += '"';
            i++;
        } else if (char === '"') {
            insideQuotes = !insideQuotes;
        } else if (char === ',' && !insideQuotes) {
            row.push(current.trim());
            current = "";
        } else if (char === '\n' && !insideQuotes) {
            row.push(current.trim());
            rows.push(row);
            row = [];
            current = "";
        } else {
            current += char;
        }
    }

    if (current.length > 0) row.push(current.trim());
    if (row.length > 0) rows.push(row);

    return rows;
}

/* ============================================================
   MAPAS DE SECTORES JP + TW + USA
   ============================================================ */

const sectorMapJP: Record<string, string> = {
    "銀行業": "Banking",
    "化学": "Chemicals",
    "電気機器": "Electrical Equipment",
    "情報・通信業": "Communications",
    "小売業": "Retail",
    "サービス業": "Commercial Services & Supplies",
    "建設業": "Construction",
    "不動産業": "Real Estate",
    "食料品": "Food Products",
    "医薬品": "Pharmaceuticals",
    "パルプ・紙": "Packaging",
    "鉄鋼": "Metals & Mining",
    "機械": "Machinery",
    "精密機器": "Technology",
    "その他製品": "Consumer Products",
    "輸送用機器": "Automobiles",
    "海運業": "Marine",
    "空運業": "Airlines",
    "保険業": "Insurance",
    "エネルギー資源": "Energy",
    "通信": "Telecommunication",
    "ガラス・土石製品": "Building Materials",
    "石油・石炭製品": "Energy",
    "ゴム製品": "Packaging",
    "非鉄金属": "Metals & Mining",
    "金属製品": "Metals & Mining",
    "倉庫・運輸関連業": "Logistics & Transportation",
    "陸運業": "Logistics & Transportation",
    "卸売業": "Retail",
    "水産・農林業": "Food Products",
    "繊維製品": "Textiles, Apparel & Luxury Goods",
    "電気・ガス業": "Utilities",
    "その他金融業": "Financial Services",
    "N/A": "N/A"
};

const sectorMapTW: Record<string, string> = {
    "電子工業": "Technology",
    "電子零組件": "Electrical Equipment",
    "半導体": "Semiconductors",
    "光電": "Technology",
    "生技醫療": "Biotechnology",
    "食品工業": "Food Products",
    "食品": "Food Products",
    "化學工業": "Chemicals",
    "化工": "Chemicals",
    "金融保險": "Financial Services",
    "金融": "Financial Services",
    "汽車": "Automobiles",
    "航運業": "Marine",
    "航運": "Marine",
    "航空業": "Airlines",
    "航空": "Airlines",
    "通信網路": "Telecommunication",
    "建材營造": "Construction",
    "建材": "Building Materials",
    "紡織纖維": "Textiles, Apparel & Luxury Goods",
    "紡織": "Textiles, Apparel & Luxury Goods",
    "塑膠工業": "Packaging",
    "塑膠": "Packaging",
    "鋼鐵工業": "Metals & Mining",
    "鋼鐵": "Metals & Mining",
    "零售": "Retail",
    "保險": "Insurance",
    "不動產": "Real Estate",
    "能源": "Energy",
    "N/A": "N/A"
};

// NUEVO: Finnhub usa su propia taxonomía (finnhubIndustry), distinta del
// esquema canónico usado por JP/TW y por el mapeo de Damodaran. Si no se
// normaliza aquí, la mayoría de sectores de USA nunca hacen match en el
// UPDATE de beta y se quedan en NULL para siempre. Completa este mapa con
// los valores reales que te vaya devolviendo la API (ver comentario en
// insertarSectoresUSA).
const sectorMapUSA: Record<string, string> = {
    "Technology": "Technology",
    "Semiconductors": "Semiconductors",
    "Banking": "Banking",
    "Insurance": "Insurance",
    "Real Estate": "Real Estate",
    "Retail": "Retail",
    "Auto/Tires/Trucks": "Automobiles",
    "Beverages - Alcoholic": "Beverages",
    "Beverages - Non-Alcoholic": "Beverages",
    "Chemicals": "Chemicals",
    "Construction": "Construction",
    "Airlines": "Airlines",
    "Marine Transportation": "Marine",
    "Trucking": "Road & Rail",
    "Railroads": "Road & Rail",
    "Oil & Gas": "Energy",
    "Utilities": "Utilities",
    "Metals & Mining": "Metals & Mining",
    "Pharmaceuticals": "Pharmaceuticals",
    "Biotechnology": "Biotechnology",
    "Health Care": "Health Care",
    "Media": "Media",
    "Telecommunications": "Telecommunication",
    "Packaging": "Packaging",
    "Textiles, Apparel & Luxury Goods": "Textiles, Apparel & Luxury Goods",
    "Hotels, Restaurants & Leisure": "Hotels, Restaurants & Leisure",
    "Food Products": "Food Products",
    "Tobacco": "Tobacco",
    "Aerospace & Defense": "Aerospace & Defense",
    "Machinery": "Machinery",
    "Electrical Equipment": "Electrical Equipment",
    "Consumer Products": "Consumer Products",
    "N/A": "N/A"
};

/* ============================================================
   NORMALIZADORES
   ============================================================ */

export function normalizarSectorJP(sector: string): string {
    return sectorMapJP[sector] || "N/A";
}

export function normalizarSectorTW(sector: string): string {
    return sectorMapTW[sector] || "N/A";
}

export function normalizarSectorUSA(sector: string): string {
    return sectorMapUSA[sector] || "N/A";
}

/* ============================================================
   INSERTAR SECTOR
   ============================================================ */

async function insertarSector(nombreSector: string) {
    const nombreLimpio = nombreSector.trim();
    const sql = `
        INSERT INTO sector (nombre_sector, sensibilidad_al_mercado)
        VALUES (?, NULL)
        ON DUPLICATE KEY UPDATE nombre_sector = VALUES(nombre_sector)
    `;
    await (conexion as any).query(sql, [nombreLimpio]);
    console.log("Sector insertado:", nombreLimpio);
}

/* ============================================================
   USA (FINNHUB)
   ============================================================ */

async function insertarSectoresUSA() {
    const secURL = "https://www.sec.gov/files/company_tickers.json";
    const response = await fetch(secURL, { headers: { "User-Agent": "Mozilla/5.0" } });
    const data: Record<string, EmpresaSEC> = await response.json();

    // Útil para depurar: guarda aquí los finnhubIndustry "crudos" que no
    // están todavía en sectorMapUSA, para ir completando el mapeo con
    // valores reales en vez de adivinar.
    const industriasSinMapear = new Set<string>();

    for (const key in data) {
        const empresa = data[key];
        const ticker = empresa.ticker;

        const finHubUrl =
            `https://finnhub.io/api/v1/stock/profile2?symbol=${ticker}&token=d9lut01r01qhk6k6au20d9lut01r01qhk6k6au2g`;

        const finHubResponse = await fetch(finHubUrl);
        const finHubData = await finHubResponse.json();

        if (!finHubData || !finHubData.finnhubIndustry) continue;

        const sectorNormalizado = normalizarSectorUSA(finHubData.finnhubIndustry);

        if (sectorNormalizado === "N/A" && !sectorMapUSA[finHubData.finnhubIndustry]) {
            industriasSinMapear.add(finHubData.finnhubIndustry);
        }

        await insertarSector(sectorNormalizado);
    }

    if (industriasSinMapear.size > 0) {
        console.log("Industrias de Finnhub sin mapear en sectorMapUSA:", [...industriasSinMapear]);
    }

    console.log("Sectores USA insertados.");
}

/* ============================================================
   JAPÓN (EDINET)
   ============================================================ */

async function obtenerSectoresJapon(): Promise<string[]> {
    const url = "https://raw.githubusercontent.com/code4fukui/EDINET/main/data/edinetcode.csv";
    const res = await fetch(url);
    const text = await res.text();

    const filas = parseCSV(text).slice(2);

    const sectoresJP = new Set<string>();

    for (const fila of filas) {
        const sectorJP = fila[10];
        if (sectorJP) sectoresJP.add(sectorJP);
    }

    return [...sectoresJP];
}

/* ============================================================
   TAIWÁN (TWSE) — nota: probablemente bloqueado por WAF fuera de Taiwán
   ============================================================ */

async function obtenerSectoresTaiwan(): Promise<string[]> {
    const url = "https://openapi.twse.com.tw/v1/opendata/t187ap03_L.json";

    const res = await fetch(url, {
        headers: {
            "User-Agent": "Mozilla/5.0",
            "Accept": "application/json, text/plain, */*",
            "Referer": "https://www.twse.com.tw/"
        }
    });

    const text = await res.text();

    if (text.startsWith("<")) {
        console.log("TWSE devolvió HTML, bloqueo temporal.");
        return [];
    }

    const data = JSON.parse(text);
    const sectoresTW = new Set<string>();

    for (const c of data) {
        const sectorTW = c["產業別"] || c["Industry"];
        if (sectorTW) sectoresTW.add(sectorTW);
    }

    return [...sectoresTW];
}

/* ============================================================
   INSERTAR SECTORES JP + TW + USA
   ============================================================ */

async function insertarSectores() {
    console.log("== Insertando sectores USA ==");
    await insertarSectoresUSA();

    console.log("== Insertando sectores Japón ==");
    const sectoresJP = await obtenerSectoresJapon();
    for (const sectorOriginal of sectoresJP) {
        await insertarSector(normalizarSectorJP(sectorOriginal));
    }

    console.log("== Insertando sectores Taiwán ==");
    const sectoresTW = await obtenerSectoresTaiwan();
    for (const sectorOriginal of sectoresTW) {
        await insertarSector(normalizarSectorTW(sectorOriginal));
    }

    console.log("== Inserción de sectores completa ==");
}

/* ============================================================
   BETA APALANCADA POR SECTOR (Damodaran)
   ============================================================ */

const URL_BETA_GLOBAL = "https://www.stern.nyu.edu/~adamodar/pc/datasets/betaGlobal.xls";

interface FilaBeta {
    industria: string;
    betaApalancada: number;
}

const mapeoSectoresDamodaran: Record<string, string> = {
    "Advertising": "Media",
    "Aerospace/Defense": "Aerospace & Defense",
    "Air Transport": "Airlines",
    "Apparel": "Textiles, Apparel & Luxury Goods",
    "Auto & Truck": "Automobiles",
    "Auto Parts": "Auto Components",
    "Bank (Money Center)": "Banking",
    "Banks (Regional)": "Banking",
    "Beverage (Alcoholic)": "Beverages",
    "Beverage (Soft)": "Beverages",
    "Broadcasting": "Media",
    "Brokerage & Investment Banking": "Financial Services",
    "Building Materials": "Building Materials",
    "Business & Consumer Services": "Commercial Services & Supplies",
    "Cable TV": "Media",
    "Chemical (Basic)": "Chemicals",
    "Chemical (Diversified)": "Chemicals",
    "Chemical (Specialty)": "Chemicals",
    "Coal & Related Energy": "Energy",
    "Computer Services": "Technology",
    "Computers/Peripherals": "Technology",
    "Construction Supplies": "Building Materials",
    "Diversified": "Industrial Conglomerates",
    "Drugs (Biotechnology)": "Biotechnology",
    "Drugs (Pharmaceutical)": "Pharmaceuticals",
    "Education": "Diversified Consumer Services",
    "Electrical Equipment": "Electrical Equipment",
    "Electronics (Consumer & Office)": "Technology",
    "Electronics (General)": "Electrical Equipment",
    "Engineering/Construction": "Construction",
    "Entertainment": "Media",
    "Environmental & Waste Services": "Commercial Services & Supplies",
    "Farming/Agriculture": "Food Products",
    "Financial Svcs. (Non-bank & Insurance)": "Financial Services",
    "Food Processing": "Food Products",
    "Food Wholesalers": "Trading Companies & Distributors",
    "Furn/Home Furnishings": "Consumer Products",
    "Green & Renewable Energy": "Energy",
    "Healthcare Products": "Health Care",
    "Healthcare Support Services": "Health Care",
    "Heathcare Information and Technology": "Health Care",
    "Homebuilding": "Construction",
    "Hospitals/Healthcare Facilities": "Health Care",
    "Hotel/Gaming": "Hotels, Restaurants & Leisure",
    "Household Products": "Consumer Products",
    "Information Services": "Professional Services",
    "Insurance (General)": "Insurance",
    "Insurance (Life)": "Insurance",
    "Insurance (Prop/Cas.)": "Insurance",
    "Investments & Asset Management": "Financial Services",
    "Machinery": "Machinery",
    "Metals & Mining": "Metals & Mining",
    "Office Equipment & Services": "Technology",
    "Oil/Gas (Integrated)": "Energy",
    "Oil/Gas (Production and Exploration)": "Energy",
    "Oil/Gas Distribution": "Energy",
    "Oilfield Svcs/Equip.": "Energy",
    "Packaging & Container": "Packaging",
    "Paper/Forest Products": "Packaging",
    "Power": "Utilities",
    "Precious Metals": "Metals & Mining",
    "Publishing & Newspapers": "Media",
    "R.E.I.T.": "Real Estate",
    "Real Estate (Development)": "Real Estate",
    "Real Estate (General/Diversified)": "Real Estate",
    "Real Estate (Operations & Services)": "Real Estate",
    "Recreation": "Leisure Products",
    "Reinsurance": "Insurance",
    "Restaurant/Dining": "Hotels, Restaurants & Leisure",
    "Retail (Automotive)": "Retail",
    "Retail (Building Supply)": "Retail",
    "Retail (Distributors)": "Distributors",
    "Retail (General)": "Retail",
    "Retail (Grocery and Food)": "Retail",
    "Retail (REITs)": "Real Estate",
    "Retail (Special Lines)": "Retail",
    "Rubber& Tires": "Auto Components",
    "Semiconductor": "Semiconductors",
    "Semiconductor Equip": "Semiconductors",
    "Shipbuilding & Marine": "Marine",
    "Shoe": "Textiles, Apparel & Luxury Goods",
    "Software (Entertainment)": "Technology",
    "Software (Internet)": "Technology",
    "Software (System & Application)": "Technology",
    "Steel": "Metals & Mining",
    "Telecom (Wireless)": "Telecommunication",
    "Telecom. Equipment": "Telecommunication",
    "Telecom. Services": "Telecommunication",
    "Tobacco": "Tobacco",
    "Transportation": "Logistics & Transportation",
    "Transportation (Railroads)": "Road & Rail",
    "Trucking": "Road & Rail",
    "Utility (General)": "Utilities",
    "Utility (Water)": "Utilities"
};

async function descargarBetasPorSector(): Promise<FilaBeta[]> {
    console.log("== Descargando betas por sector (Damodaran) ==");

    const res = await fetch(URL_BETA_GLOBAL);
    const buffer = await res.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: "array" });

    const nombreHoja = workbook.SheetNames.includes("Industry Averages")
        ? "Industry Averages"
        : workbook.SheetNames[0];

    const hoja = workbook.Sheets[nombreHoja];

    // La fila de encabezados reales está en el índice 9 (0-based)
    const filasRaw = XLSX.utils.sheet_to_json<Record<string, any>>(hoja, { range: 9 });

    const resultado: FilaBeta[] = [];

    for (const filaRaw of filasRaw) {
        // Normalizamos las claves quitando espacios sobrantes,
        // para no depender de si el Excel trae "Beta " con espacio o no
        const fila: Record<string, any> = {};
        for (const key of Object.keys(filaRaw)) {
            fila[key.trim()] = filaRaw[key];
        }

        const industria = fila["Industry Name"];
        const betaRaw = fila["Beta"];
        const betaNum = typeof betaRaw === "number" ? betaRaw : parseFloat(betaRaw);

        if (!industria || isNaN(betaNum)) continue;

        resultado.push({ industria: String(industria).trim(), betaApalancada: betaNum });
    }

    console.log(`  ${resultado.length} sectores con beta descargados de Damodaran`);
    return resultado;
}

// Dado un sector propio (el nombre que guardas en tu tabla `sector`) que no
// tiene equivalencia directa en Damodaran, calcula una beta aproximada como
// la media de los sectores de Damodaran más cercanos, según
// SECTOR_DAMODARAN_FALLBACK. mapaDamodaran es industria de Damodaran (en
// mayúsculas) -> beta.
function obtenerSensibilidadFallbackDamodaran(
    nombreSector: string,
    mapaDamodaran: Map<string, number>
): number | null {
    const sector = String(nombreSector || "").trim().toUpperCase();
    const equivalencias = SECTOR_DAMODARAN_FALLBACK[sector];

    if (!equivalencias || equivalencias.length === 0) {
        return null;
    }

    const valores = equivalencias
        .map(nombre => mapaDamodaran.get(nombre.trim().toUpperCase()))
        .filter((valor): valor is number => typeof valor === "number" && Number.isFinite(valor));

    if (valores.length === 0) {
        return null;
    }

    const media = valores.reduce((acum, valor) => acum + valor, 0) / valores.length;
    return Number(media.toFixed(4));
}

async function actualizarSensibilidadMercado() {
    const betas = await descargarBetasPorSector();

    // Mapa auxiliar: industria de Damodaran (en mayúsculas) -> beta.
    // Lo usa el fallback para calcular la media de sectores equivalentes.
    const mapaDamodaran = new Map<string, number>();
    for (const { industria, betaApalancada } of betas) {
        mapaDamodaran.set(industria.trim().toUpperCase(), betaApalancada);
    }

    /* ---------- PASADA 1: match directo vía mapeoSectoresDamodaran ---------- */

    let actualizados = 0;
    let sinMatch = 0;
    const industriasSinMatch: string[] = [];

    for (const { industria, betaApalancada } of betas) {
        const nombreNormalizado = mapeoSectoresDamodaran[industria];

        if (!nombreNormalizado) {
            sinMatch++;
            industriasSinMatch.push(industria);
            continue;
        }

        // TRIM() protege contra espacios colados al insertar sectores
        // desde fuentes distintas (JSON de Finnhub, CSV de EDINET, JSON de TWSE).
        const [result]: any = await (conexion as any).query(
            "UPDATE sector SET sensibilidad_al_mercado = ? WHERE TRIM(nombre_sector) = TRIM(?)",
            [betaApalancada, nombreNormalizado]
        );

        if (result.affectedRows > 0) {
            actualizados++;
        }
    }

    console.log(`== Pasada 1 (match directo): ${actualizados} actualizados | ${sinMatch} industrias de Damodaran sin mapear ==`);
    if (industriasSinMatch.length > 0) {
        console.log("Industrias de Damodaran sin entrada en mapeoSectoresDamodaran:", industriasSinMatch);
    }

    /* ---------- PASADA 2: fallback para los sectores que siguen en NULL ---------- */
    // Aquí caen sectores como Communications, Life Sciences Tools & Services,
    // Transportation Infrastructure, Building: no tienen match exacto en
    // mapeoSectoresDamodaran, pero sí una aproximación en SECTOR_DAMODARAN_FALLBACK.

    const [sectoresNulos]: any = await (conexion as any).query(
        "SELECT nombre_sector FROM sector WHERE sensibilidad_al_mercado IS NULL"
    );

    let actualizadosFallback = 0;
    const sinResolver: string[] = [];

    for (const fila of sectoresNulos) {
        const nombreSector: string = fila.nombre_sector;

        let sensibilidad = obtenerSensibilidadFallbackDamodaran(nombreSector, mapaDamodaran);

        // Último recurso: si el propio sector no tiene fallback definido,
        // usamos la beta de "Total Market" si existe en el dataset de Damodaran.
        if (sensibilidad === null) {
            const totalMarket = mapaDamodaran.get("TOTAL MARKET");
            if (totalMarket !== undefined) {
                sensibilidad = totalMarket;
            }
        }

        if (sensibilidad === null) {
            sinResolver.push(nombreSector);
            continue;
        }

        const [result]: any = await (conexion as any).query(
            "UPDATE sector SET sensibilidad_al_mercado = ? WHERE TRIM(nombre_sector) = TRIM(?)",
            [sensibilidad, nombreSector]
        );

        if (result.affectedRows > 0) {
            actualizadosFallback++;
            console.log(`Fallback aplicado a "${nombreSector}": ${sensibilidad}`);
        }
    }

    console.log(`== Pasada 2 (fallback): ${actualizadosFallback} actualizados ==`);
    if (sinResolver.length > 0) {
        console.log("Sectores sin fallback definido en SECTOR_DAMODARAN_FALLBACK:", sinResolver);
    }

    // Diagnóstico final: qué sectores de la tabla se quedaron sin beta.
    const [nulosFinal]: any = await (conexion as any).query(
        "SELECT nombre_sector FROM sector WHERE sensibilidad_al_mercado IS NULL"
    );
    if (nulosFinal.length > 0) {
        console.log("Sectores que siguen en NULL tras la actualización:", nulosFinal.map((r: any) => r.nombre_sector));
    }
}

/* ============================================================
   MAIN
   ============================================================ */

async function main() {
    // await insertarSectores();
    await actualizarSensibilidadMercado();
}

if (require.main === module) {
    main();
}