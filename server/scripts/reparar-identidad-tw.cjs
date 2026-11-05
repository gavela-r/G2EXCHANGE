// Reparación de identidad Taiwán <-> Japón y de mercado/precio de instrumentos TW.
//
// Causa raíz: `instrumento.ticker` era UNIQUE global. Los códigos bursátiles de Taiwán
// (4 dígitos) coinciden con códigos de Tokio; el importador TW reutilizó el instrumento
// japonés (mercado 4) y le puso moneda TWD. Resultado: 299 empresas TW (incluida TSMC 2330)
// cargaban informes EDINET y el precio de una empresa japonesa, y las japonesas legítimas
// quedaban sin instrumento ni informes.
//
// Qué hace (todo en una transacción, salvo la migración 12 que es DDL):
//  1. Migración 12: UNIQUE(mercado_id, ticker) en lugar de UNIQUE(ticker).
//  2. Para cada instrumento TWD en mercado 4: el instrumento (con su precio japonés) pasa a la
//     empresa japonesa identificada por el código EDINET oficial (证券コード = ticker+'0'),
//     con moneda JPY; los informes EDINET de la empresa TW pasan a esa empresa japonesa.
//     Si la japonesa no existe en la BD, se crea con el nombre oficial EDINET (inglés).
//  3. Cada empresa TW obtiene (o conserva) un instrumento en TWSE (5) o TPEx (6) según las
//     listas oficiales t187ap03_L / mopsfin_t187ap03_O.
//  4. Precio TW: último cierre oficial TWSE STOCK_DAY_ALL / TPEx daily close quotes.
//
// Uso: node server/scripts/reparar-identidad-tw.cjs <dir_fuentes> [--write]
require('dotenv').config({ path: require('node:path').join(__dirname, '../../.env') });
const fs = require('node:fs');
const path = require('node:path');
const mysql = require('mysql2/promise');

const dir = process.argv[2];
const WRITE = process.argv.includes('--write');
if (!dir) { console.error('Uso: reparar-identidad-tw.cjs <dir_fuentes> [--write]'); process.exit(2); }
const leer = f => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
const rocAFecha = s => `${Number(s.slice(0, 3)) + 1911}-${s.slice(3, 5)}-${s.slice(5, 7)}`;
const num = s => { const n = Number(String(s ?? '').replace(/,/g, '').trim()); return Number.isFinite(n) && n > 0 ? n : null; };

function normalizarNombre(s) {
  return String(s || '').toLowerCase().normalize('NFKC')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\b(the|co|ltd|limited|inc|incorporated|corporation|corp|kk|kabushiki|kaisha|company|holdings?|hd|group)\b/g, ' ')
    .replace(/\s+/g, '').trim();
}

function edinetPorCodigo() {
  const f = fs.readdirSync(path.join(dir, 'edinet')).find(x => x.endsWith('.csv'));
  const txt = new TextDecoder('shift_jis').decode(fs.readFileSync(path.join(dir, 'edinet', f)));
  const m = new Map();
  for (const linea of txt.split(/\r?\n/).slice(2)) {
    const c = linea.match(/"([^"]*)"/g)?.map(x => x.slice(1, -1));
    if (!c || c.length < 12 || !c[11]) continue;
    m.set(c[11], { edinet: c[0], nombre: c[6], nombreEn: c[7], listado: c[2] });
  }
  return m;
}

(async () => {
  const twse = leer('twse_list.json'), tpex = leer('tpex_list.json');
  const oficial = new Map();
  for (const r of twse) oficial.set(r['公司代號'].trim(), { mercado: 5, nombre: r['公司簡稱'], acciones: num(r['已發行普通股數或TDR原股發行股數']) });
  for (const r of tpex) oficial.set(String(r.SecuritiesCompanyCode).trim(), { mercado: 6, nombre: r.CompanyAbbreviation, acciones: num(r.IssueShares) });
  const cierres = new Map();
  for (const r of leer('twse_close.json')) { const p = num(r.ClosingPrice); if (p) cierres.set(r.Code.trim() + '|5', { precio: p, fecha: rocAFecha(r.Date) }); }
  for (const r of leer('tpex_close.json')) { const p = num(r.Close); if (p) cierres.set(String(r.SecuritiesCompanyCode).trim() + '|6', { precio: p, fecha: rocAFecha(r.Date) }); }
  const edinet = edinetPorCodigo();

  const db = await mysql.createConnection({ host: process.env.DB_HOST, port: +process.env.DB_PORT, user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME, multipleStatements: false });
  const [[{ tw }]] = await db.query("SELECT id tw FROM pais WHERE codigo_iso='TW'");
  const [[{ jp }]] = await db.query("SELECT id jp FROM pais WHERE codigo_iso='JP'");
  const [[{ na }]] = await db.query("SELECT id na FROM sector WHERE nombre_sector='N/A'");

  // 1. Migración 12
  const [idx] = await db.query("SHOW INDEX FROM instrumento WHERE Key_name IN ('ticker','uq_instrumento_mercado_ticker')");
  const tieneNuevo = idx.some(i => i.Key_name === 'uq_instrumento_mercado_ticker');
  const informe = { migracion12: tieneNuevo ? 'YA_APLICADA' : (WRITE ? 'APLICADA' : 'PENDIENTE'), colisiones: [], instrumentosTw: { creados: 0, corregidos: 0, sinListaOficial: [] }, precios: 0, jpCreadas: 0 };
  if (!tieneNuevo && WRITE) {
    const [dup] = await db.query('SELECT ticker,mercado_id,COUNT(*) n FROM instrumento GROUP BY ticker,mercado_id HAVING n>1');
    if (dup.length) throw new Error('Duplicados mercado/ticker: no se aplica migración 12');
    await db.query('ALTER TABLE instrumento ADD UNIQUE KEY uq_instrumento_mercado_ticker (mercado_id,ticker), DROP INDEX ticker');
  }

  const [jpEmpresas] = await db.query('SELECT e.id, e.nombre_empresa, (SELECT COUNT(*) FROM instrumento i WHERE i.empresa_id=e.id) ins FROM empresa e WHERE e.pais_id=?', [jp]);
  const jpPorNombre = new Map();
  for (const e of jpEmpresas) { const k = normalizarNombre(e.nombre_empresa); if (!k) continue; jpPorNombre.set(k, jpPorNombre.has(k) ? null : e); }

  await db.beginTransaction();
  try {
    // 2. Colisiones
    const [col] = await db.query(`SELECT i.id, i.ticker, i.empresa_id, e.nombre_empresa FROM instrumento i JOIN empresa e ON e.id=i.empresa_id
      WHERE e.pais_id=? AND i.mercado_id=4`, [tw]);
    for (const c of col) {
      const ed = edinet.get(`${c.ticker}0`);
      const reg = { instrumento: c.id, ticker: c.ticker, empresaTw: c.empresa_id, nombreTw: c.nombre_empresa, edinet: ed?.edinet ?? null, nombreJp: ed?.nombreEn ?? null, empresaJp: null, accion: null, informesMovidos: 0 };
      let jpId = null;
      if (ed) {
        const cand = jpPorNombre.get(normalizarNombre(ed.nombreEn));
        if (cand && cand.ins === 0) { jpId = cand.id; reg.accion = 'JP_EXISTENTE'; }
        else if (!cand) {
          reg.accion = 'JP_CREADA';
          if (WRITE) {
            const [r] = await db.query('INSERT INTO empresa (nombre_empresa,pais_id,sector_id) VALUES (?,?,?) ON DUPLICATE KEY UPDATE id=LAST_INSERT_ID(id)', [String(ed.nombreEn || ed.nombre).slice(0, 100), jp, na]);
            jpId = r.insertId;
          }
          informe.jpCreadas++;
        } else reg.accion = cand ? 'JP_AMBIGUA_O_CON_INSTRUMENTO' : 'SIN_JP';
      } else reg.accion = 'SIN_CODIGO_EDINET';
      reg.empresaJp = jpId;
      const [[{ n }]] = await db.query("SELECT COUNT(*) n FROM informe_financiero WHERE empresa_id=? AND fuente='EDINET'", [c.empresa_id]);
      reg.informesMovidos = jpId || !WRITE ? n : 0;
      if (WRITE) {
        if (jpId) {
          await db.query("UPDATE informe_financiero SET empresa_id=? WHERE empresa_id=? AND fuente='EDINET'", [jpId, c.empresa_id]);
          await db.query('UPDATE valuation_input_version v JOIN informe_financiero f ON f.id=v.informe_id SET v.empresa_id=? WHERE f.empresa_id=? AND v.empresa_id=?', [jpId, jpId, c.empresa_id]);
          await db.query("UPDATE instrumento SET empresa_id=?, moneda='JPY' WHERE id=?", [jpId, c.id]);
        } else {
          // Sin empresa japonesa verificable: el instrumento de Tokio se desvincula del emisor TW
          // conservando su precio; los informes EDINET quedan en la empresa TW pero fuera de uso anual.
          await db.query("UPDATE instrumento SET moneda='JPY', empresa_id=NULL WHERE id=?", [c.id]);
          await db.query("UPDATE informe_financiero SET tipo_periodo=CONCAT(tipo_periodo,'_EDINET_NO_TW') WHERE empresa_id=? AND fuente='EDINET' AND tipo_periodo NOT LIKE '%_EDINET_NO_TW'", [c.empresa_id]);
        }
      }
      informe.colisiones.push(reg);
    }

    // 3. Instrumento TW correcto para cada empresa TW
    const [twEmp] = await db.query(`SELECT e.id, e.nombre_empresa, (SELECT GROUP_CONCAT(CONCAT(i.id,':',i.mercado_id,':',i.ticker)) FROM instrumento i WHERE i.empresa_id=e.id) ins
      FROM empresa e WHERE e.pais_id=?`, [tw]);
    const tickerTw = new Map(informe.colisiones.map(c => [c.empresaTw, c.ticker]));
    for (const e of twEmp) {
      const lista = (e.ins ? e.ins.split(',') : []).map(s => { const [id, m, t] = s.split(':'); return { id: +id, mercado: +m, ticker: t }; });
      const propios = lista.filter(x => x.mercado === 5 || x.mercado === 6);
      const ticker = propios[0]?.ticker ?? tickerTw.get(e.id);
      if (!ticker) continue;
      const of = oficial.get(ticker);
      if (!of) { informe.instrumentosTw.sinListaOficial.push(ticker); continue; }
      if (propios.length) {
        for (const p of propios) if (p.mercado !== of.mercado) { informe.instrumentosTw.corregidos++; if (WRITE) await db.query('UPDATE instrumento SET mercado_id=? WHERE id=?', [of.mercado, p.id]); }
      } else {
        informe.instrumentosTw.creados++;
        if (WRITE) await db.query("INSERT INTO instrumento (empresa_id,mercado_id,ticker,moneda) VALUES (?,?,?,'TWD')", [e.id, of.mercado, ticker]);
      }
    }

    // 4. Precio oficial TW
    const [twIns] = await db.query("SELECT i.id, i.ticker, i.mercado_id FROM instrumento i JOIN empresa e ON e.id=i.empresa_id WHERE e.pais_id=? AND i.mercado_id IN (5,6)", [tw]);
    for (const i of twIns) {
      const c = cierres.get(`${i.ticker}|${i.mercado_id}`);
      if (!c) continue;
      informe.precios++;
      if (WRITE) await db.query('INSERT INTO cotizacion_diaria (instrumento_id,fecha,precio_cierre) VALUES (?,?,?) ON DUPLICATE KEY UPDATE fecha=VALUES(fecha), precio_cierre=VALUES(precio_cierre)', [i.id, c.fecha, c.precio]);
    }
    if (WRITE) await db.commit(); else await db.rollback();
  } catch (e) { await db.rollback(); throw e; }

  const resumen = {
    modo: WRITE ? 'ESCRITURA' : 'ENSAYO', migracion12: informe.migracion12,
    colisiones: informe.colisiones.length,
    porAccion: informe.colisiones.reduce((a, c) => (a[c.accion] = (a[c.accion] ?? 0) + 1, a), {}),
    informesEdinetMovidos: informe.colisiones.reduce((s, c) => s + c.informesMovidos, 0),
    jpCreadas: informe.jpCreadas, instrumentosTw: { ...informe.instrumentosTw, sinListaOficial: informe.instrumentosTw.sinListaOficial.length }, preciosTw: informe.precios,
  };
  console.log(JSON.stringify(resumen, null, 1));
  const out = path.join(__dirname, '../../private_backups', `reparacion-identidad-tw-${WRITE ? 'write' : 'dry'}-${Date.now()}.json`);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify({ resumen, detalle: informe }, null, 1));
  console.log('Detalle:', out);
  await db.end();
})().catch(e => { console.error(e); process.exit(1); });
