// Clasificación sectorial de Taiwán con el código de industria OFICIAL (產業別) de las listas
// TWSE OpenAPI t187ap03_L y TPEx OpenAPI mopsfin_t187ap03_O. Añade evidencia (classification_evidence);
// nunca modifica empresa.sector_id.
//
// Solo se aceptan códigos con correspondencia inequívoca a un sector del motor que no requiera
// revisión (DIRECTA/GENERAL). Categorías amplias o mixtas (金融保險, 生技醫療, 化學, 塑膠, 水泥,
// 資訊服務, 文化創意, 貿易百貨, 其他...) quedan PENDING.
// Hardware electrónico (電腦及週邊設備, 光電, 其他電子) usa la plantilla 03 "semiconductores y
// hardware" a través del sector 19; el criterio lo deja explícito.
//
// Uso: node server/scripts/clasificar-tw-oficial.cjs <dir_fuentes> [--write]
require('dotenv').config({ path: require('node:path').join(__dirname, '../../.env') });
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const mysql = require('mysql2/promise');

const OFICIAL = {
  '02': [181, '食品工業'], '04': [56, '紡織纖維'], '05': [20, '電機機械'], '06': [46, '電器電纜'], '09': [97, '造紙工業'],
  '10': [10, '鋼鐵工業'], '12': [9, '汽車工業'], '14': [31, '建材營造'], '15': [131, '航運業'], '16': [2, '觀光餐旅'],
  '23': [6, '油電燃氣業'], '24': [19, '半導體業'], '25': [19, '電腦及週邊設備業 (plantilla 03 hardware)'], '26': [19, '光電業 (plantilla 03 hardware)'],
  '27': [62, '通信網路業'], '28': [46, '電子零組件業'], '29': [102, '電子通路業'], '31': [19, '其他電子業 (plantilla 03 hardware)'],
  '34': [15, '電子商務'], '37': [182, '運動休閒'], '38': [13, '居家生活'],
};
const rocAFecha = s => `${Number(s.slice(0, 3)) + 1911}-${s.slice(3, 5)}-${s.slice(5, 7)}`;

(async () => {
  const dir = process.argv[2], WRITE = process.argv.includes('--write');
  if (!dir) throw new Error('Uso: clasificar-tw-oficial.cjs <dir_fuentes> [--write]');
  const leer = f => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
  const registros = [
    ...leer('twse_list.json').map(r => ({ ticker: r['公司代號'].trim(), mercado: 5, nombre: r['公司名稱'], industria: r['產業別'], fecha: rocAFecha(r['出表日期']), fuente: 'https://openapi.twse.com.tw/v1/opendata/t187ap03_L' })),
    ...leer('tpex_list.json').map(r => ({ ticker: String(r.SecuritiesCompanyCode).trim(), mercado: 6, nombre: r.CompanyName, industria: r.SecuritiesIndustryCode, fecha: rocAFecha(r.Date), fuente: 'https://www.tpex.org.tw/openapi/v1/mopsfin_t187ap03_O' })),
  ];
  const db = await mysql.createConnection({ host: process.env.DB_HOST, port: +process.env.DB_PORT, user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME });
  const c = { listados: registros.length, identificados: 0, aceptados: 0, pendientes: 0, insertados: 0, ambiguos: 0 };
  for (const r of registros) {
    const [emp] = await db.query("SELECT DISTINCT e.id FROM instrumento i JOIN empresa e ON e.id=i.empresa_id JOIN pais p ON p.id=e.pais_id AND p.codigo_iso='TW' WHERE i.ticker=? AND i.mercado_id=?", [r.ticker, r.mercado]);
    if (!emp.length) continue;
    if (emp.length > 1) { c.ambiguos++; continue; }
    c.identificados++;
    const m = OFICIAL[r.industria];
    const status = m ? 'ACCEPTED' : 'PENDING';
    c[m ? 'aceptados' : 'pendientes']++;
    const criterio = m ? `TW_OFFICIAL_INDUSTRY_V1: 產業別 ${r.industria} ${m[1]}` : `TW_OFFICIAL_INDUSTRY_V1: 產業別 ${r.industria} amplio o sin correspondencia inequívoca`;
    const evidencia = { ticker: r.ticker, mercado: r.mercado, nombre_oficial: r.nombre, industria: r.industria, fuente: r.fuente, fecha: r.fecha };
    // Una evidencia PENDING no debe ocultar una clasificación ACCEPTED/HIGH previa de otra fuente.
    const [previa] = m ? [[]] : await db.query("SELECT 1 FROM classification_evidence WHERE empresa_id=? AND status='ACCEPTED' AND confidence='HIGH' LIMIT 1", [emp[0].id]);
    if (!m && previa.length) continue;
    if (WRITE) {
      const [res] = await db.query(`INSERT IGNORE INTO classification_evidence(empresa_id,sector_id,source,reference_date,source_identifier,criterion,confidence,status,evidence_hash,evidence_json) VALUES (?,?,?,?,?,?,?,?,?,?)`,
        [emp[0].id, m ? m[0] : null, r.fuente, r.fecha, `${r.mercado === 5 ? 'TWSE' : 'TPEX'}:${r.ticker}`, criterio, m ? 'HIGH' : 'LOW', status, crypto.createHash('sha256').update(JSON.stringify(evidencia)).digest('hex'), JSON.stringify(evidencia)]);
      c.insertados += res.affectedRows;
    }
  }
  console.log(JSON.stringify({ modo: WRITE ? 'ESCRITURA' : 'ENSAYO', ...c }));
  await db.end();
})().catch(e => { console.error(e); process.exit(1); });
