// Diagnóstico de solo lectura: pasa los informes anuales 2022-2025 por normalizarPartidas
// y cuenta, por país, cuántos quedan utilizables, ambiguos y qué conceptos faltan.
// Uso: node server/scripts/diagnosticar-normalizacion.cjs [--json salida.json]
require('../tests/config.cjs');
const mysql = require('mysql2/promise');
const { normalizarPartidas } = require('../dist/src/valoracion/datos');
require('dotenv').config({ path: require('node:path').join(__dirname, '../../.env') });

const NECESARIOS = ['INGRESOS', 'EBIT', 'DEPRECIACION_AMORTIZACION', 'ACCIONES_EN_CIRCULACION', 'DEUDA_TOTAL', 'EFECTIVO'];

(async () => {
  const db = await mysql.createConnection({ host: process.env.DB_HOST, port: +process.env.DB_PORT, user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME });
  const [informes] = await db.query(`SELECT i.id, i.fuente, p.codigo_iso pais FROM informe_financiero i JOIN empresa e ON e.id=i.empresa_id JOIN pais p ON p.id=e.pais_id
    WHERE i.tipo_periodo='ANUAL' AND YEAR(i.fecha_fin_periodo) BETWEEN 2022 AND 2025`);
  const porPais = {};
  const ambiguos = {};
  for (let off = 0; off < informes.length; off += 2000) {
    const lote = informes.slice(off, off + 2000);
    const [rows] = await db.query(`SELECT pc.informe_id, pc.concepto, pc.importe, tc.concepto_estandar, tc.signo_esperado, tc.alias_sec, tc.alias_edinet, tc.alias_finmind
      FROM partida_contable_valor pc JOIN taxonomia_concepto tc ON tc.id=pc.concepto_estandar_id WHERE pc.informe_id IN (?) ORDER BY pc.id`, [lote.map(x => x.id)]);
    const g = new Map();
    for (const r of rows) { if (!g.has(r.informe_id)) g.set(r.informe_id, []); g.get(r.informe_id).push(r); }
    for (const inf of lote) {
      const s = porPais[inf.pais] ??= { informes: 0, ok: 0, ambiguos: 0, nucleoCompleto: 0, faltan: {} };
      s.informes++;
      try {
        const v = normalizarPartidas(g.get(inf.id) ?? [], inf.fuente).valores;
        s.ok++;
        const f = NECESARIOS.filter(k => v[k] === undefined);
        if (!f.length) s.nucleoCompleto++;
        for (const k of f) s.faltan[k] = (s.faltan[k] ?? 0) + 1;
      } catch (e) {
        s.ambiguos++;
        const k = `${inf.pais}:${String(e.message).split(':')[0]}`;
        ambiguos[k] = (ambiguos[k] ?? 0) + 1;
      }
    }
  }
  console.log(JSON.stringify({ porPais, ambiguos }, null, 1));
  const i = process.argv.indexOf('--json');
  if (i > 0) require('node:fs').writeFileSync(process.argv[i + 1], JSON.stringify({ porPais, ambiguos }, null, 1));
  await db.end();
})().catch(e => { console.error(e); process.exit(1); });
