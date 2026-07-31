import conexion from "../conexion/bd";


interface EmpresaSEC {
    cick_str: number;
    ticker: string;
    title: string;
}

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
   MAPAS DE SECTORES JP + TW
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

/* ============================================================
   NORMALIZADORES
   ============================================================ */

export function normalizarSectorJP(sector: string): string {
    return sectorMapJP[sector] || "N/A";
}

export function normalizarSectorTW(sector: string): string {
    return sectorMapTW[sector] || "N/A";
}

/* ============================================================
   INSERTAR SECTOR
   ============================================================ */

async function insertarSector(nombreSector: string) {
    const sql = `
        INSERT INTO sector (nombre_sector, sensibilidad_al_mercado)
        VALUES (?, NULL)
        ON DUPLICATE KEY UPDATE nombre_sector = VALUES(nombre_sector)
    `;
    await (conexion as any).query(sql, [nombreSector]);
    console.log("Sector insertado:", nombreSector);
}

/* ============================================================
   USA (FINNHUB)
   ============================================================ */

// async function insertarSectoresUSA() {
//     const secURL = "https://www.sec.gov/files/company_tickers.json";
//     const response = await fetch(secURL, { headers: { "User-Agent": "Mozilla/5.0" } });
//     const data: Record<string, EmpresaSEC> = await response.json();

//     for (const key in data) {
//         const empresa = data[key];
//         const ticker = empresa.ticker;

//         const finHubUrl =
//             `https://finnhub.io/api/v1/stock/profile2?symbol=${ticker}&token=d9ktkghr01qshkro93ggd9ktkghr01qshkro93h0`;

//         const finHubResponse = await fetch(finHubUrl);
//         const finHubData = await finHubResponse.json();

//         if (!finHubData || !finHubData.finnhubIndustry) continue;

//         await insertarSector(finHubData.finnhubIndustry);
//     }

//     console.log("Sectores USA insertados.");
// }

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
        const sectorJP = fila[10]; // columna real del sector
        if (sectorJP) sectoresJP.add(sectorJP);
    }

    return [...sectoresJP];
}

/* ============================================================
   TAIWÁN (TWSE)
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
    // console.log("== Insertando sectores USA ==");
    // await insertarSectoresUSA();

    console.log("== Insertando sectores Japón ==");
    const sectoresJP = await obtenerSectoresJapon();

    console.log("== Insertando sectores Taiwán ==");
    const sectoresTW = await obtenerSectoresTaiwan();

    const todos = [...sectoresJP, ...sectoresTW];

    console.log(`== Normalizando ${todos.length} sectores ==`);

    for (const sectorOriginal of todos) {
        const normalizado =
            normalizarSectorJP(sectorOriginal) ||
            normalizarSectorTW(sectorOriginal) ||
            "N/A";

        await insertarSector(normalizado);
    }

    console.log("== Inserción completa ==");
}

insertarSectores();

