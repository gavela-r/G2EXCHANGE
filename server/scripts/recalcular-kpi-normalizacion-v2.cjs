// Recalcula kpi_financiero_informe con la normalización vigente (resolución de conceptos V2)
// y la fórmula vigente (incluido DEUDA_NETA_SOBRE_EBITDA y deuda solo con ambos componentes).
//
// Por informe: inserta/actualiza los KPI calculables y elimina los KPI propios (los 18 códigos
// de kpiCalcularInforme) que ya no son reproducibles con las partidas almacenadas.
// Nunca toca partidas contables. Informe JSON con recuentos en private_backups/.
//
// Uso: node server/scripts/recalcular-kpi-normalizacion-v2.cjs [--write] [--pais US|JP|TW]
require('dotenv').config({ path: require('node:path').join(__dirname, '../../.env') });
const fs = require('node:fs');
const path = require('node:path');
const mysql = require('mysql2/promise');
const { normalizarPartidas } = require('../dist/src/valoracion/datos');
const { kpiCalcularInforme } = require('../dist/insercionDatos/insercionKPIInformeFinanciero');

const WRITE = process.argv.includes('--write');
const PAIS = process.argv.includes('--pais') ? process.argv[process.argv.indexOf('--pais') + 1] : null;
const PROPIOS = ['MARGEN_BRUTO', 'MARGEN_EBIT', 'MARGEN_NETO', 'ROA', 'ROE', 'DEUDA_TOTAL', 'DEUDA_NETA', 'DEUDA_SOBRE_PATRIMONIO', 'DEUDA_SOBRE_ACTIVOS',
  'COBERTURA_INTERESES', 'EBITDA', 'MARGEN_EBITDA', 'DEUDA_NETA_SOBRE_EBITDA', 'FCF', 'MARGEN_FCF', 'CAPITAL_CIRCULANTE_OPERATIVO', 'CAPITAL_CIRCULANTE_OPERATIVO_SOBRE_INGRESOS', 'PASIVO_SOBRE_ACTIVOS'];

(async () => {
  const db = await mysql.createConnection({ host: process.env.DB_HOST, port: +process.env.DB_PORT, user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME });
  const [informes] = await db.query(`SELECT i.id, i.fuente FROM informe_financiero i JOIN empresa e ON e.id=i.empresa_id JOIN pais p ON p.id=e.pais_id
    WHERE i.tipo_periodo IN ('ANUAL','TRIMESTRAL','SEMESTRAL') ${PAIS ? 'AND p.codigo_iso=?' : ''} ORDER BY i.id`, PAIS ? [PAIS] : []);
  const r = { modo: WRITE ? 'ESCRITURA' : 'ENSAYO', informes: informes.length, ambiguos: 0, nuevos: 0, actualizados: 0, iguales: 0, eliminados: 0, porKpi: {} };
  const cuenta = (k, campo) => { (r.porKpi[k] ??= { nuevos: 0, actualizados: 0, eliminados: 0 })[campo]++; };
  for (let off = 0; off < informes.length; off += 1000) {
    const lote = informes.slice(off, off + 1000), ids = lote.map(x => x.id);
    const [pcv] = await db.query(`SELECT pc.informe_id, pc.concepto, pc.importe, tc.concepto_estandar, tc.signo_esperado, tc.alias_sec, tc.alias_edinet, tc.alias_finmind
      FROM partida_contable_valor pc JOIN taxonomia_concepto tc ON tc.id=pc.concepto_estandar_id WHERE pc.informe_id IN (?) ORDER BY pc.id`, [ids]);
    const [kpis] = await db.query('SELECT id, informe_id, kpi, valor FROM kpi_financiero_informe WHERE informe_id IN (?)', [ids]);
    const pg = new Map(), kg = new Map();
    for (const x of pcv) (pg.get(x.informe_id) ?? pg.set(x.informe_id, []).get(x.informe_id)).push(x);
    for (const x of kpis) (kg.get(x.informe_id) ?? kg.set(x.informe_id, []).get(x.informe_id)).push(x);
    const upserts = [], borrar = [];
    for (const inf of lote) {
      let calc;
      try { calc = kpiCalcularInforme(inf.id, normalizarPartidas(pg.get(inf.id) ?? [], inf.fuente).valores); }
      catch { r.ambiguos++; calc = []; }
      const antes = new Map((kg.get(inf.id) ?? []).map(k => [k.kpi, k]));
      const nuevosCodigos = new Set(calc.map(k => k.kpi));
      for (const k of calc) {
        const a = antes.get(k.kpi);
        if (!a) { r.nuevos++; cuenta(k.kpi, 'nuevos'); }
        else if (Math.abs(Number(a.valor) - k.valor) <= Math.max(1e-9, Math.abs(k.valor) * 1e-9)) { r.iguales++; continue; }
        else { r.actualizados++; cuenta(k.kpi, 'actualizados'); }
        upserts.push([inf.id, k.kpi, k.unidad, k.valor, String(k.nivelConfianza).toLowerCase(), new Date()]);
      }
      for (const [codigo, a] of antes) if (PROPIOS.includes(codigo) && !nuevosCodigos.has(codigo)) { borrar.push(a.id); r.eliminados++; cuenta(codigo, 'eliminados'); }
    }
    if (WRITE) {
      await db.beginTransaction();
      try {
        if (upserts.length) await db.query('INSERT INTO kpi_financiero_informe (informe_id,kpi,unidad,valor,nivel_confianza,fecha_calculo) VALUES ? ON DUPLICATE KEY UPDATE valor=VALUES(valor),unidad=VALUES(unidad),nivel_confianza=VALUES(nivel_confianza),fecha_calculo=VALUES(fecha_calculo)', [upserts]);
        if (borrar.length) await db.query('DELETE FROM kpi_financiero_informe WHERE id IN (?)', [borrar]);
        await db.commit();
      } catch (e) { await db.rollback(); throw e; }
    }
    process.stdout.write(`\r${Math.min(off + 1000, informes.length)}/${informes.length}`);
  }
  console.log('\n' + JSON.stringify(r, null, 1));
  fs.writeFileSync(path.join(__dirname, '../../private_backups', `recalculo-kpi-v2-${r.modo.toLowerCase()}-${Date.now()}.json`), JSON.stringify(r, null, 1));
  await db.end();
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
