// Separa empresas de Taiwán fusionadas por colisión de nombre en pinyin.
//
// `empresa` es única por (nombre_empresa, pais_id) y el importador TW guardaba el nombre en pinyin
// sin tonos: 欣興 (3037, Unimicron) y 新興 (2605) eran ambas "xin xing" y compartían una sola fila,
// mezclando informes y valoraciones. Cada ticker TWSE/TPEx es un emisor distinto.
//
// Para cada empresa TW con más de un instrumento TWSE/TPEx: el instrumento de menor id conserva la
// empresa; cada uno de los demás pasa a una empresa nueva "<pinyin> (<ticker>)" con el mismo sector,
// junto con sus informes FinMind identificados por ticker (FINMIND_FY:<t>:*, FINMIND:<t>:*), sus
// versiones financieras y su evidencia de clasificación (TWSE:<t>/TPEX:<t>).
//
// Uso: node server/scripts/separar-empresas-tw-pinyin.cjs [--write]
require('dotenv').config({ path: require('node:path').join(__dirname, '../../.env') });
const fs = require('node:fs');
const path = require('node:path');
const mysql = require('mysql2/promise');
const WRITE = process.argv.includes('--write');

(async () => {
  const db = await mysql.createConnection({ host: process.env.DB_HOST, port: +process.env.DB_PORT, user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME });
  const [grupos] = await db.query(`SELECT e.id, e.nombre_empresa, e.pais_id, e.sector_id, GROUP_CONCAT(CONCAT(i.id,':',i.ticker) ORDER BY i.id) ins
    FROM empresa e JOIN pais p ON p.id=e.pais_id AND p.codigo_iso='TW' JOIN instrumento i ON i.empresa_id=e.id AND i.mercado_id IN (5,6)
    GROUP BY e.id HAVING COUNT(*)>1`);
  const detalle = [];
  await db.beginTransaction();
  try {
    for (const g of grupos) {
      const lista = g.ins.split(',').map(s => { const [id, t] = s.split(':'); return { id: +id, ticker: t }; });
      for (const x of lista.slice(1)) {
        const nombre = `${g.nombre_empresa} (${x.ticker})`.slice(0, 100);
        const reg = { origen: g.id, ticker: x.ticker, nombre, informes: 0 };
        if (WRITE) {
          const [r] = await db.query('INSERT INTO empresa (nombre_empresa,pais_id,sector_id) VALUES (?,?,?) ON DUPLICATE KEY UPDATE id=LAST_INSERT_ID(id)', [nombre, g.pais_id, g.sector_id]);
          const nuevo = r.insertId; reg.nueva = nuevo;
          await db.query('UPDATE instrumento SET empresa_id=? WHERE id=?', [nuevo, x.id]);
          const [m] = await db.query("UPDATE informe_financiero SET empresa_id=? WHERE empresa_id=? AND (identificador_fuente LIKE ? OR identificador_fuente LIKE ?)", [nuevo, g.id, `FINMIND_FY:${x.ticker}:%`, `FINMIND:${x.ticker}:%`]);
          reg.informes = m.affectedRows;
          await db.query('UPDATE valuation_input_version v JOIN informe_financiero f ON f.id=v.informe_id SET v.empresa_id=? WHERE f.empresa_id=? AND v.empresa_id=?', [nuevo, nuevo, g.id]);
          await db.query("UPDATE classification_evidence SET empresa_id=? WHERE empresa_id=? AND source_identifier IN (?,?)", [nuevo, g.id, `TWSE:${x.ticker}`, `TPEX:${x.ticker}`]);
        }
        detalle.push(reg);
      }
    }
    if (WRITE) await db.commit(); else await db.rollback();
  } catch (e) { await db.rollback(); throw e; }
  const r = { modo: WRITE ? 'ESCRITURA' : 'ENSAYO', empresasFusionadas: grupos.length, empresasNuevas: detalle.length, informesMovidos: detalle.reduce((s, d) => s + d.informes, 0) };
  console.log(JSON.stringify(r));
  fs.writeFileSync(path.join(__dirname, '../../private_backups', `separacion-tw-pinyin-${r.modo.toLowerCase()}-${Date.now()}.json`), JSON.stringify({ r, detalle }, null, 1));
  await db.end();
})().catch(e => { console.error(e); process.exit(1); });
