// Clasificación sectorial de Japón con el sector oficial TSE-33 (提出者業種) de la lista de
// códigos EDINET (FSA, descarga pública EdinetcodeDlInfo.csv). Añade evidencia; no modifica empresa.
//
// Identidad: instrumento de Tokio (mercado 4) cuyo ticker coincide con el 証券コード EDINET
// (ticker + '0') Y cuyo nombre normalizado coincide con el nombre oficial inglés EDINET.
// Solo se aceptan sectores TSE-33 con correspondencia inequívoca a un sector del motor que no requiera
// revisión. Sectores mixtos (化学, 情報・通信業, サービス業, 不動産業, 精密機器, その他...) quedan PENDING.
//
// Uso: node server/scripts/clasificar-jp-tse33.cjs <dir_fuentes> [--write]
require('dotenv').config({ path: require('node:path').join(__dirname, '../../.env') });
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const mysql = require('mysql2/promise');

const TSE33 = {
  '水産・農林業': 181, '鉱業': 6, '建設業': 31, '食料品': 181, '繊維製品': 56, 'パルプ・紙': 97, '医薬品': 137, '石油・石炭製品': 6,
  '鉄鋼': 10, '非鉄金属': 10, '金属製品': 20, '機械': 20, '電気機器': 46, '輸送用機器': 9, '電気・ガス業': 4, '陸運業': 336,
  '海運業': 131, '空運業': 176, '倉庫・運輸関連業': 1, '卸売業': 11, '小売業': 15, '銀行業': 16, '保険業': 12,
};
function norm(s) {
  return String(s || '').toLowerCase().normalize('NFKC').replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\b(the|co|ltd|ldt|limited|inc|incorporated|corporation|corp|kk|company|holdings?|hd|group)\b/g, ' ').replace(/\s+/g, '');
}

(async () => {
  const dir = process.argv[2], WRITE = process.argv.includes('--write');
  if (!dir) throw new Error('Uso: clasificar-jp-tse33.cjs <dir_fuentes> [--write]');
  const f = fs.readdirSync(path.join(dir, 'edinet')).find(x => x.endsWith('.csv'));
  const lineas = new TextDecoder('shift_jis').decode(fs.readFileSync(path.join(dir, 'edinet', f))).split(/\r?\n/);
  const fecha = (lineas[0].match(/(\d{4})年(\d{2})月(\d{2})日/) || []).slice(1).join('-');
  const db = await mysql.createConnection({ host: process.env.DB_HOST, port: +process.env.DB_PORT, user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME });
  const [ins] = await db.query("SELECT i.ticker, e.id empresa_id, e.nombre_empresa FROM instrumento i JOIN empresa e ON e.id=i.empresa_id JOIN pais p ON p.id=e.pais_id AND p.codigo_iso='JP' WHERE i.mercado_id=4");
  const porTicker = new Map(ins.map(x => [x.ticker, x]));
  const c = { edinetConCodigo: 0, identificados: 0, nombreNoCoincide: 0, aceptados: 0, pendientes: 0, insertados: 0, omitidosPorAceptadaPrevia: 0 };
  for (const l of lineas.slice(2)) {
    const col = l.match(/"([^"]*)"/g)?.map(x => x.slice(1, -1));
    if (!col || !col[11] || col[11].length !== 5 || !col[11].endsWith('0')) continue;
    c.edinetConCodigo++;
    const x = porTicker.get(col[11].slice(0, 4));
    if (!x) continue;
    const a = norm(x.nombre_empresa), b = norm(col[7]);
    if (!a || !b || !(a === b || a.startsWith(b) || b.startsWith(a))) { c.nombreNoCoincide++; continue; }
    c.identificados++;
    const sector = TSE33[col[10]];
    if (!sector) {
      const [previa] = await db.query("SELECT 1 FROM classification_evidence WHERE empresa_id=? AND status='ACCEPTED' AND confidence='HIGH' LIMIT 1", [x.empresa_id]);
      if (previa.length) { c.omitidosPorAceptadaPrevia++; continue; }
    }
    c[sector ? 'aceptados' : 'pendientes']++;
    const ev = { edinet: col[0], codigo: col[11], nombre_oficial: col[6], nombre_en: col[7], tse33: col[10], fuente: 'EDINET EdinetcodeDlInfo.csv (FSA)', fecha };
    if (WRITE) {
      const [r] = await db.query(`INSERT IGNORE INTO classification_evidence(empresa_id,sector_id,source,reference_date,source_identifier,criterion,confidence,status,evidence_hash,evidence_json) VALUES (?,?,?,?,?,?,?,?,?,?)`,
        [x.empresa_id, sector ?? null, 'https://disclosure2dl.edinet-fsa.go.jp/searchdocument/codelist/Edinetcode.zip', fecha, `EDINET:${col[0]}`,
          `JP_TSE33_OFFICIAL_V1: ${sector ? 'sector oficial con correspondencia inequívoca' : 'sector oficial amplio o mixto'}`, sector ? 'HIGH' : 'LOW', sector ? 'ACCEPTED' : 'PENDING',
          crypto.createHash('sha256').update(JSON.stringify(ev)).digest('hex'), JSON.stringify(ev)]);
      c.insertados += r.affectedRows;
    }
  }
  console.log(JSON.stringify({ modo: WRITE ? 'ESCRITURA' : 'ENSAYO', fecha, ...c }));
  await db.end();
})().catch(e => { console.error(e); process.exit(1); });
