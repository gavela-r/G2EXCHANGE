// Añade ACTIVOS_CORRIENTES y PASIVOS_CORRIENTES (CurrentAssets / CurrentLiabilities de FinMind, saldo al cierre)
// a los anuales TW reconstruidos (identificador FINMIND_FY:<ticker>:<año>) que no los tienen, y recalcula sus KPI
// (incluido FONDO_MANIOBRA). Mismo cierre que importar-finmind-tw-anual.cjs: último saldo de diciembre del ejercicio.
//
// Sin --fetch solo usa la caché private_backups/finmind-tw-cache (no gasta cuota). Con --fetch pide únicamente el
// balance de las empresas sin caché, a 12,5 s por petición (no lanzar a la vez que el importador: comparten cuota).
// Uso: node server/scripts/completar-corrientes-tw.cjs [--write] [--fetch]
require('dotenv').config({ path: require('node:path').join(__dirname, '../../.env') });
const fs = require('node:fs');
const path = require('node:path');
const mysql = require('mysql2/promise');
const { normalizarPartidas } = require('../dist/src/valoracion/datos');
const { kpiCalcularInforme } = require('../dist/insercionDatos/insercionKPIInformeFinanciero');

const WRITE = process.argv.includes('--write');
const FETCH = process.argv.includes('--fetch');
const ESPERA_MS = Number(process.env.FINMIND_TW_SPACING_MS || 12500);
const TOKEN = process.env.FINMIND_TOKEN || '';
const CACHE = path.join(__dirname, '../../private_backups/finmind-tw-cache');
const PARADA = path.join(__dirname, '../../private_backups/completar-corrientes-tw.stop');
const dormir = ms => new Promise(r => setTimeout(r, ms));
let ultimo = 0, bloqueos = 0;

async function balance(ticker) {
  const fichero = path.join(CACHE, `TaiwanStockBalanceSheet-${ticker}.json`);
  if (fs.existsSync(fichero)) return JSON.parse(fs.readFileSync(fichero, 'utf8'));
  if (!FETCH) return null;
  for (let intento = 0; intento < 10; intento++) {
    const espera = ultimo + ESPERA_MS - Date.now();
    if (espera > 0) await dormir(espera);
    ultimo = Date.now();
    const r = await fetch(`https://api.finmindtrade.com/api/v4/data?dataset=TaiwanStockBalanceSheet&data_id=${ticker}&start_date=2021-01-01&end_date=2025-12-31`,
      { headers: TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}, signal: AbortSignal.timeout(45000) }).catch(e => ({ ok: false, status: 0, error: e }));
    const j = r.json ? await r.json().catch(() => ({})) : {};
    if (r.status === 402 || r.status === 429 || j.status === 402) {
      bloqueos++; const min = Math.min(60, 15 * bloqueos);
      console.log(`[cuota] ${r.status} esperando ${min} min`); await dormir(min * 60000); continue;
    }
    if (!r.ok || j.status !== 200) { if (intento >= 4) throw new Error(`HTTP ${r.status} ${j.msg ?? ''}`); await dormir(5000 * (intento + 1)); continue; }
    bloqueos = 0;
    fs.mkdirSync(CACHE, { recursive: true });
    fs.writeFileSync(fichero, JSON.stringify(j.data));
    return j.data;
  }
  throw new Error('Cuota FinMind no recuperada');
}

(async () => {
  if (fs.existsSync(PARADA)) fs.unlinkSync(PARADA);
  const db = await mysql.createConnection({ host: process.env.DB_HOST, port: +process.env.DB_PORT, user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME });
  const [tax] = await db.query("SELECT id, concepto_estandar, signo_esperado, alias_sec, alias_edinet, alias_finmind FROM taxonomia_concepto");
  const T = Object.fromEntries(tax.map(t => [t.concepto_estandar, t]));
  if (!T.ACTIVOS_CORRIENTES || !T.PASIVOS_CORRIENTES) throw new Error('Falta la taxonomía: aplicar server/sql/26_fondo_maniobra.sql');
  const [pend] = await db.query(`SELECT i.id, i.identificador_fuente ident FROM informe_financiero i
    WHERE i.fuente='FINMIND' AND i.tipo_periodo='ANUAL' AND i.identificador_fuente LIKE 'FINMIND_FY:%'
      AND NOT EXISTS (SELECT 1 FROM partida_contable_valor p WHERE p.informe_id=i.id AND p.concepto_estandar_id IN (?, ?))`,
    [T.ACTIVOS_CORRIENTES.id, T.PASIVOS_CORRIENTES.id]);
  const porTicker = new Map();
  for (const p of pend) { const [, ticker, y] = p.ident.split(':'); (porTicker.get(ticker) ?? porTicker.set(ticker, []).get(ticker)).push({ id: p.id, y: Number(y) }); }
  console.log(`Informes sin corrientes: ${pend.length} (${porTicker.size} empresas); modo ${WRITE ? 'ESCRITURA' : 'ENSAYO'}${FETCH ? ' con descarga' : ' solo caché'}`);
  const r = { completados: 0, sinCache: 0, sinDato: 0, errores: 0, kpi: 0 };
  let n = 0;
  for (const [ticker, informes] of porTicker) {
    if (fs.existsSync(PARADA)) { console.log('Parada solicitada.'); break; }
    n++;
    try {
      const datos = await balance(ticker);
      if (!datos) { r.sinCache += informes.length; continue; }
      const m = new Map();
      for (const d of datos) if (!String(d.type).endsWith('_per')) m.set(`${d.type}|${d.date}`, Number(d.value));
      for (const inf of informes) {
        const cierre = [...new Set([...m.keys()].map(k => k.split('|')[1]).filter(d => d.startsWith(`${inf.y}-`) && d >= `${inf.y}-12-01`))].sort().pop();
        const ac = cierre && m.get(`CurrentAssets|${cierre}`), pc = cierre && m.get(`CurrentLiabilities|${cierre}`);
        const filas = [];
        if (Number.isFinite(ac)) filas.push([inf.id, 'CurrentAssets', T.ACTIVOS_CORRIENTES.id, ac, 'SALDO_CIERRE']);
        if (Number.isFinite(pc)) filas.push([inf.id, 'CurrentLiabilities', T.PASIVOS_CORRIENTES.id, pc, 'SALDO_CIERRE']);
        if (!filas.length) { r.sinDato++; continue; }
        if (WRITE) {
          await db.beginTransaction();
          try {
            await db.query('INSERT INTO partida_contable_valor (informe_id,concepto,concepto_estandar_id,importe,nivel_confianza) VALUES ?', [filas]);
            const [pcv] = await db.query(`SELECT pc.concepto, pc.importe, tc.concepto_estandar, tc.signo_esperado, tc.alias_sec, tc.alias_edinet, tc.alias_finmind
              FROM partida_contable_valor pc JOIN taxonomia_concepto tc ON tc.id=pc.concepto_estandar_id WHERE pc.informe_id=?`, [inf.id]);
            const kpis = kpiCalcularInforme(inf.id, normalizarPartidas(pcv, 'FINMIND').valores);
            if (kpis.length) await db.query('INSERT INTO kpi_financiero_informe (informe_id,kpi,unidad,valor,nivel_confianza,fecha_calculo) VALUES ? ON DUPLICATE KEY UPDATE valor=VALUES(valor),unidad=VALUES(unidad),nivel_confianza=VALUES(nivel_confianza),fecha_calculo=VALUES(fecha_calculo)',
              [kpis.map(k => [inf.id, k.kpi, k.unidad, k.valor, String(k.nivelConfianza).toLowerCase(), new Date()])]);
            if (kpis.some(k => k.kpi === 'FONDO_MANIOBRA')) r.kpi++;
            await db.commit();
          } catch (e) { await db.rollback(); throw e; }
        }
        r.completados++;
      }
      if (n % 25 === 0) console.log(`[${n}/${porTicker.size}] ${JSON.stringify(r)}`);
    } catch (e) {
      r.errores++;
      console.log(`${ticker} ERROR ${e.message}`);
      if (/closed state|ECONNREFUSED|PROTOCOL_CONNECTION_LOST|ECONNRESET/.test(String(e.message) + String(e.code))) { console.log('Conexión con MySQL perdida: detenido.'); process.exit(2); }
    }
  }
  console.log(JSON.stringify(r));
  await db.end();
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
