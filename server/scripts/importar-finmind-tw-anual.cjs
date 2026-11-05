// Reconstrucción de los ejercicios anuales de Taiwán desde FinMind (TIFRS, MOPS).
//
// Defecto corregido: los informes "ANUAL" FinMind previos guardaban la cuenta de resultados
// del 4º trimestre aislado (FinMind publica resultados trimestrales NO acumulados) junto con
// flujos de caja acumulados del año y balance de cierre. Además no tenían fecha de publicación,
// por lo que el motor nunca podía usarlos (exige fecha_publicacion <= fecha de valoración).
//
// Construcción de cada ejercicio FY (año natural, cierre 31/12):
//   - Cuenta de resultados: suma de los 4 trimestres publicados (se exige que estén los 4).
//   - Flujos de caja: valor acumulado del 4º trimestre (= año completo).
//   - Balance: saldo al 31/12.
//   - Acciones: OrdinaryShare (capital social) / valor nominal oficial (TWSE/TPEx).
//   - Fecha de publicación: plazo legal de los estados anuales (art. 36 Ley del Mercado de
//     Valores de Taiwán: 3 meses tras el cierre) => FY+1-03-31. Es una cota superior: el dato
//     estaba público como tarde ese día, así que no introduce información futura.
//   - Deuda: si el balance está completo (activo, pasivo y patrimonio) y la línea de deuda no se
//     presenta, se registra 0 marcado CERO_NO_PRESENTADO_BALANCE_COMPLETO (en TIFRS las líneas
//     sin saldo no se presentan). Si el balance no está completo, la deuda queda ausente.
//
// Contrastes obligatorios por ejercicio (si fallan, el ejercicio NO se inserta):
//   A) |Activo - (Pasivo + Patrimonio total)| <= 0,5 % del activo.
//   B) Ingresos anuales > 0 y, si hay coste de ventas, |Bruto - (Ingresos - Coste)| <= 1 %.
//   C) Acciones: |BPA anual x acciones - beneficio atribuible| <= 15 % (si no, no se guardan
//      acciones de ese ejercicio, pero el resto sí).
//
// Uso: node server/scripts/importar-finmind-tw-anual.cjs <dir_fuentes> [--write] [--limit N] [--ticker 2330]
require('dotenv').config({ path: require('node:path').join(__dirname, '../../.env') });
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const mysql = require('mysql2/promise');
const { normalizarPartidas } = require('../dist/src/valoracion/datos');
const { kpiCalcularInforme } = require('../dist/insercionDatos/insercionKPIInformeFinanciero');

const args = process.argv.slice(2);
const dir = args[0];
const WRITE = args.includes('--write');
const LIMIT = args.includes('--limit') ? Number(args[args.indexOf('--limit') + 1]) : Infinity;
const SOLO = args.includes('--ticker') ? args[args.indexOf('--ticker') + 1].split(',') : null;
const ANOS = [2021, 2022, 2023, 2024, 2025];
const ESPERA_MS = Number(process.env.FINMIND_TW_SPACING_MS || 12500); // ~288 peticiones/hora (límite sin token: 300/h)
const TOKEN = process.env.FINMIND_TOKEN || '';
const CHECKPOINT = path.join(__dirname, '../../private_backups/tw-finmind-anual-checkpoint.json');

const IS = { INGRESOS: ['Revenue'], BENEFICIO_BRUTO: ['GrossProfit'], EBIT: ['OperatingIncome'], BENEFICIO_ANTES_IMPUESTOS: ['PreTaxIncome'], IMPUESTO_BENEFICIOS: ['TAX'], BENEFICIO_NETO: ['EquityAttributableToOwnersOfParent'], EPS_DILUIDO: ['EPS'] };
const CF = { FLUJO_CAJA_OPERATIVO: ['CashFlowsFromOperatingActivities'], CAPEX: ['PropertyAndPlantAndEquipment'], DEPRECIACION_AMORTIZACION: ['Depreciation', 'AmortizationExpense'], GASTO_INTERESES: ['InterestExpense'] };
const BS = { EFECTIVO: ['CashAndCashEquivalents'], ACTIVOS_TOTALES: ['TotalAssets'], PASIVOS_TOTALES: ['Liabilities'], PATRIMONIO_NETO: ['EquityAttributableToOwnersOfParent'], INVENTARIOS: ['Inventories'], CUENTAS_COBRAR: ['AccountsReceivableNet'], CUENTAS_PAGAR: ['AccountsPayable'], DEUDA_CORTO_PLAZO: ['ShorttermBorrowings'], DEUDA_LARGO_PLAZO: ['LongtermBorrowings', 'BondsPayable'] };

const dormir = ms => new Promise(r => setTimeout(r, ms));
let ultimo = 0;
async function finmind(dataset, ticker) {
  for (let intento = 0; intento < 8; intento++) {
    const espera = ultimo + ESPERA_MS - Date.now();
    if (espera > 0) await dormir(espera);
    ultimo = Date.now();
    const url = `https://api.finmindtrade.com/api/v4/data?dataset=${dataset}&data_id=${ticker}&start_date=2021-01-01&end_date=2025-12-31`;
    try {
      const r = await fetch(url, { headers: TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}, signal: AbortSignal.timeout(45000) });
      const j = await r.json().catch(() => ({}));
      if (r.status === 402 || r.status === 429 || j.status === 402) { console.log(`[cuota] ${r.status} esperando 10 min`); await dormir(600000); continue; }
      if (!r.ok || j.status !== 200) throw new Error(`HTTP ${r.status} ${j.msg ?? ''}`);
      return j.data;
    } catch (e) { if (intento >= 3) throw e; await dormir(5000 * (intento + 1)); }
  }
  throw new Error('Cuota FinMind no recuperada');
}

const leer = f => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
const num = s => { const n = Number(String(s ?? '').replace(/[^0-9.]/g, '')); return Number.isFinite(n) && n > 0 ? n : null; };
const porTipoFecha = filas => { const m = new Map(); for (const r of filas) if (!String(r.type).endsWith('_per')) m.set(`${r.type}|${r.date}`, Number(r.value)); return m; };
const fechasAno = (m, y) => [...new Set([...m.keys()].map(k => k.split('|')[1]).filter(d => d.startsWith(`${y}-`)))].sort();

function construirEjercicio(y, is, cf, bs, par) {
  const filas = [], problemas = [];
  const cierre = fechasAno(bs, y).filter(d => d >= `${y}-12-01`).pop();
  const cierreCf = fechasAno(cf, y).filter(d => d >= `${y}-12-01`).pop();
  const trimestres = fechasAno(is, y);
  // Resultados: 4 trimestres exactos
  if (trimestres.length === 4 && trimestres[3] >= `${y}-12-01`) {
    for (const [k, tipos] of Object.entries(IS)) for (const t of tipos) {
      const v = trimestres.map(d => is.get(`${t}|${d}`));
      if (v.every(x => Number.isFinite(x))) filas.push({ k, concepto: t, importe: v.reduce((a, b) => a + b, 0), conf: 'SUMA_4_TRIMESTRES' });
    }
  } else problemas.push(`resultados: ${trimestres.length} trimestres`);
  if (cierreCf) for (const [k, tipos] of Object.entries(CF)) for (const t of tipos) { const v = cf.get(`${t}|${cierreCf}`); if (Number.isFinite(v)) filas.push({ k, concepto: t, importe: v, conf: 'ACUMULADO_Q4' }); }
  else problemas.push('flujos: sin Q4');
  let total = {};
  if (cierre) {
    for (const [k, tipos] of Object.entries(BS)) for (const t of tipos) { const v = bs.get(`${t}|${cierre}`); if (Number.isFinite(v)) filas.push({ k, concepto: t, importe: v, conf: 'SALDO_CIERRE' }); }
    total = { activo: bs.get(`TotalAssets|${cierre}`), pasivo: bs.get(`Liabilities|${cierre}`), patrimonio: bs.get(`Equity|${cierre}`), capital: bs.get(`OrdinaryShare|${cierre}`) };
    const completo = [total.activo, total.pasivo, total.patrimonio].every(Number.isFinite);
    if (completo) {
      for (const k of ['DEUDA_CORTO_PLAZO', 'DEUDA_LARGO_PLAZO']) if (!filas.some(f => f.k === k)) filas.push({ k, concepto: `NO_PRESENTADO:${BS[k].join('+')}`, importe: 0, conf: 'CERO_NO_PRESENTADO_BALANCE_COMPLETO' });
      if (Math.abs(total.activo - (total.pasivo + total.patrimonio)) > Math.abs(total.activo) * 0.005) problemas.push('A: balance no cuadra');
    } else problemas.push('A: balance incompleto');
    if (Number.isFinite(total.capital) && par) filas.push({ k: 'ACCIONES_EN_CIRCULACION', concepto: `OrdinaryShare/ValorNominal(${par})`, importe: Math.round(total.capital / par), conf: 'CAPITAL_ENTRE_NOMINAL' });
  } else problemas.push('balance: sin cierre');
  const v = k => filas.find(f => f.k === k)?.importe;
  const ingresos = v('INGRESOS');
  if (!(ingresos > 0)) problemas.push('B: ingresos no positivos o ausentes');
  const coste = trimestres.length === 4 ? trimestres.map(d => is.get(`CostOfGoodsSold|${d}`)) : [];
  if (coste.length === 4 && coste.every(Number.isFinite) && Number.isFinite(v('BENEFICIO_BRUTO'))) {
    const c = coste.reduce((a, b) => a + b, 0);
    if (Math.abs(v('BENEFICIO_BRUTO') - (ingresos - c)) > Math.abs(ingresos) * 0.01) problemas.push('B: bruto != ingresos - coste');
  }
  const acc = v('ACCIONES_EN_CIRCULACION'), eps = v('EPS_DILUIDO'), neto = v('BENEFICIO_NETO');
  let accionesOk = null;
  if (acc && Number.isFinite(eps) && Number.isFinite(neto) && Math.abs(neto) > 0) {
    accionesOk = Math.abs(eps * acc - neto) <= Math.abs(neto) * 0.15;
    if (!accionesOk) { const i = filas.findIndex(f => f.k === 'ACCIONES_EN_CIRCULACION'); filas.splice(i, 1); }
  }
  const bloqueante = problemas.some(p => /^(A|B):|resultados|balance: sin/.test(p));
  return { y, filas, problemas, bloqueante, accionesOk, cierre };
}

(async () => {
  if (!dir) throw new Error('Uso: importar-finmind-tw-anual.cjs <dir_fuentes> [--write] [--limit N] [--ticker T]');
  const par = new Map(), accionesOf = new Map();
  for (const r of leer('twse_list.json')) { par.set(r['公司代號'].trim(), num(r['普通股每股面額'])); accionesOf.set(r['公司代號'].trim(), num(r['已發行普通股數或TDR原股發行股數'])); }
  for (const r of leer('tpex_list.json')) { par.set(String(r.SecuritiesCompanyCode).trim(), num(r.ParValueOfCommonStock)); accionesOf.set(String(r.SecuritiesCompanyCode).trim(), num(r.IssueShares)); }

  const db = await mysql.createConnection({ host: process.env.DB_HOST, port: +process.env.DB_PORT, user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME });
  const [tax] = await db.query('SELECT id, concepto_estandar, signo_esperado, alias_sec, alias_edinet, alias_finmind FROM taxonomia_concepto');
  const taxId = Object.fromEntries(tax.map(t => [t.concepto_estandar, t]));
  // Universo: empresas TW con instrumento TWSE/TPEx y precio oficial, ordenadas por capitalización estimada.
  const [univ] = await db.query(`SELECT e.id empresa_id, i.ticker, c.precio_cierre precio FROM empresa e JOIN pais p ON p.id=e.pais_id AND p.codigo_iso='TW'
    JOIN instrumento i ON i.empresa_id=e.id AND i.mercado_id IN (5,6) JOIN cotizacion_diaria c ON c.instrumento_id=i.id`);
  for (const u of univ) u.cap = Number(u.precio) * (accionesOf.get(u.ticker) ?? 0);
  univ.sort((a, b) => b.cap - a.cap);
  const hecho = fs.existsSync(CHECKPOINT) ? JSON.parse(fs.readFileSync(CHECKPOINT, 'utf8')) : { completados: {}, errores: {} };
  const cola = univ.filter(u => (SOLO ? SOLO.includes(u.ticker) : !hecho.completados[u.ticker])).slice(0, LIMIT);
  console.log(`Universo TW con precio: ${univ.length}; pendientes en esta ejecución: ${cola.length}; modo ${WRITE ? 'ESCRITURA' : 'ENSAYO'}`);

  let n = 0;
  for (const u of cola) {
    n++;
    try {
      const [is, cf, bs] = [porTipoFecha(await finmind('TaiwanStockFinancialStatements', u.ticker)), porTipoFecha(await finmind('TaiwanStockCashFlowsStatement', u.ticker)), porTipoFecha(await finmind('TaiwanStockBalanceSheet', u.ticker))];
      const ejercicios = ANOS.map(y => construirEjercicio(y, is, cf, bs, par.get(u.ticker)));
      const validos = ejercicios.filter(e => !e.bloqueante);
      const resumen = { validos: validos.map(e => e.y), rechazados: ejercicios.filter(e => e.bloqueante).map(e => `${e.y}:${e.problemas.join(';')}`), acciones: ejercicios.map(e => e.accionesOk) };
      if (WRITE && validos.length) {
        await db.beginTransaction();
        try {
          for (const e of validos) {
            const ident = `FINMIND_FY:${u.ticker}:${e.y}`;
            const [ins] = await db.query(`INSERT INTO informe_financiero (empresa_id,tipo_periodo,tipo_documento,fecha_fin_periodo,fecha_publicacion,fuente,identificador_fuente)
              VALUES (?,?,?,?,?,'FINMIND',?) ON DUPLICATE KEY UPDATE id=LAST_INSERT_ID(id), empresa_id=VALUES(empresa_id), fecha_fin_periodo=VALUES(fecha_fin_periodo), fecha_publicacion=VALUES(fecha_publicacion), tipo_periodo=VALUES(tipo_periodo), tipo_documento=VALUES(tipo_documento)`,
              [u.empresa_id, 'ANUAL', 'TIFRS_ANUAL_RECONSTRUIDO', e.cierre, `${e.y + 1}-03-31`, ident]);
            const informeId = ins.insertId;
            await db.query('DELETE FROM kpi_financiero_informe WHERE informe_id=?', [informeId]);
            await db.query('DELETE FROM partida_contable_valor WHERE informe_id=?', [informeId]);
            await db.query('INSERT INTO partida_contable_valor (informe_id,concepto,concepto_estandar_id,importe,nivel_confianza) VALUES ?', [e.filas.map(f => [informeId, f.concepto, taxId[f.k].id, f.importe, f.conf])]);
            const partes = e.filas.map(f => ({ concepto_estandar: f.k, concepto: f.concepto, importe: f.importe, signo_esperado: taxId[f.k].signo_esperado, alias_sec: taxId[f.k].alias_sec, alias_edinet: taxId[f.k].alias_edinet, alias_finmind: taxId[f.k].alias_finmind }));
            const p = normalizarPartidas(partes, 'FINMIND').valores;
            const kpis = kpiCalcularInforme(informeId, p);
            if (kpis.length) await db.query('INSERT INTO kpi_financiero_informe (informe_id,kpi,unidad,valor,nivel_confianza,fecha_calculo) VALUES ? ON DUPLICATE KEY UPDATE valor=VALUES(valor),unidad=VALUES(unidad),nivel_confianza=VALUES(nivel_confianza),fecha_calculo=VALUES(fecha_calculo)',
              [kpis.map(k => [informeId, k.kpi, k.unidad, k.valor, String(k.nivelConfianza).toLowerCase(), new Date()])]);
            const kv = Object.fromEntries(kpis.map(k => [k.kpi, k.valor]));
            const viv = { empresa_id: u.empresa_id, informe_id: informeId, tipo_periodo: 'ANUAL', fuente_informe: 'FINMIND', fecha_fin_periodo: e.cierre, moneda: 'TWD',
              ingresos: p.INGRESOS, ebitda: p.EBITDA, depreciacion_amortizacion: p.DEPRECIACION_AMORTIZACION, ebit: p.EBIT, gasto_intereses: p.GASTO_INTERESES, beneficio_antes_impuestos: p.BENEFICIO_ANTES_IMPUESTOS,
              impuesto_beneficios: p.IMPUESTO_BENEFICIOS, beneficio_neto: p.BENEFICIO_NETO, efectivo: p.EFECTIVO, deuda_corto_plazo: p.DEUDA_CORTO_PLAZO, deuda_largo_plazo: p.DEUDA_LARGO_PLAZO, deuda_total: kv.DEUDA_TOTAL, deuda_neta: kv.DEUDA_NETA,
              cuentas_cobrar: p.CUENTAS_COBRAR, inventarios: p.INVENTARIOS, cuentas_pagar: p.CUENTAS_PAGAR, patrimonio_neto: p.PATRIMONIO_NETO, activos_totales: p.ACTIVOS_TOTALES, pasivos_totales: p.PASIVOS_TOTALES,
              capital_circulante_operativo: p.CAPITAL_CIRCULANTE_OPERATIVO, flujo_caja_operativo: p.FLUJO_CAJA_OPERATIVO, capex: p.CAPEX, fcf: p.FCF, acciones_en_circulacion: p.ACCIONES_EN_CIRCULACION,
              margen_ebit: kv.MARGEN_EBIT, margen_ebitda: kv.MARGEN_EBITDA, margen_neto: kv.MARGEN_NETO, margen_fcf: kv.MARGEN_FCF, roa: kv.ROA, roe: kv.ROE, cobertura_intereses: kv.COBERTURA_INTERESES, nivel_confianza: 'MEDIA' };
            for (const k of Object.keys(viv)) if (viv[k] === undefined) viv[k] = null;
            viv.hash_inputs = crypto.createHash('sha256').update(JSON.stringify(e.filas)).digest('hex');
            await db.query('INSERT IGNORE INTO valuation_input_version SET ?', [viv]);
          }
          // Los anuales FinMind antiguos (resultados del Q4 aislado) de esta empresa dejan de tratarse como anuales.
          await db.query("UPDATE informe_financiero SET tipo_periodo='ANUAL_Q4_INVALIDO' WHERE empresa_id=? AND fuente='FINMIND' AND tipo_periodo='ANUAL' AND identificador_fuente NOT LIKE 'FINMIND_FY:%'", [u.empresa_id]);
          await db.commit();
        } catch (err) { await db.rollback(); throw err; }
      }
      hecho.completados[u.ticker] = { ...resumen, fecha: new Date().toISOString() };
      delete hecho.errores[u.ticker];
      console.log(`[${n}/${cola.length}] ${u.ticker} FY válidos ${resumen.validos.join(',') || '-'} | rechazados ${resumen.rechazados.length}`);
    } catch (err) {
      hecho.errores[u.ticker] = String(err.message).slice(0, 300);
      console.log(`[${n}/${cola.length}] ${u.ticker} ERROR ${err.message}`);
    }
    if (WRITE) fs.writeFileSync(CHECKPOINT, JSON.stringify(hecho, null, 1));
  }
  await db.end();
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
