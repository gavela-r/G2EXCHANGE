// ¿Por qué falta la deuda en los anuales US (FY2022–2025)? Cruce con evidencias propias de la base, sin descargar nada.
//
// Para cada informe sin deuda CP o LP (tras normalizar) mira:
//   - intereses: la cuenta de resultados del mismo informe publica gasto por intereses > 0 (=> hay deuda que no se capturó)
//   - otro año: la misma empresa sí publica ese componente en otro anual (=> la línea existe, falta en ese año)
//   - trimestral: un 10-Q de la empresa en ese ejercicio sí publica el componente
//   - nada: ni intereses ni el componente en ningún periodo (=> probablemente la empresa no tiene esa deuda)
// Solo lectura. Uso: node server/scripts/diagnosticar-deuda-us.cjs
require('dotenv').config({ path: require('node:path').join(__dirname, '../../.env') });
const mysql = require('mysql2/promise');
const { normalizarPartidas } = require('../dist/src/valoracion/datos');

(async () => {
  const db = await mysql.createConnection({ host: process.env.DB_HOST, port: +process.env.DB_PORT, user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME });
  const [informes] = await db.query(`SELECT i.id, i.empresa_id, i.tipo_periodo, i.fecha_fin_periodo fin FROM informe_financiero i JOIN empresa e ON e.id=i.empresa_id JOIN pais p ON p.id=e.pais_id AND p.codigo_iso='US'
    WHERE i.fuente='SEC_EDGAR' AND i.tipo_periodo IN ('ANUAL','TRIMESTRAL') AND i.fecha_fin_periodo BETWEEN '2020-01-01' AND '2025-12-31'`);
  const valores = new Map();
  for (let off = 0; off < informes.length; off += 2000) {
    const ids = informes.slice(off, off + 2000).map(x => x.id);
    const [pcv] = await db.query(`SELECT pc.informe_id, pc.concepto, pc.importe, tc.concepto_estandar, tc.signo_esperado, tc.alias_sec, tc.alias_edinet, tc.alias_finmind
      FROM partida_contable_valor pc JOIN taxonomia_concepto tc ON tc.id=pc.concepto_estandar_id WHERE pc.informe_id IN (?)`, [ids]);
    const g = new Map();
    for (const x of pcv) (g.get(x.informe_id) ?? g.set(x.informe_id, []).get(x.informe_id)).push(x);
    for (const id of ids) { try { valores.set(id, { v: normalizarPartidas(g.get(id) ?? [], 'SEC_EDGAR').valores, crudo: new Set((g.get(id) ?? []).map(f => f.concepto_estandar)) }); } catch { valores.set(id, null); } }
    process.stderr.write(`\r${Math.min(off + 2000, informes.length)}/${informes.length}`);
  }
  process.stderr.write('\n');
  const porEmpresa = new Map();
  for (const i of informes) (porEmpresa.get(i.empresa_id) ?? porEmpresa.set(i.empresa_id, []).get(i.empresa_id)).push(i);

  const r = {};
  for (const k of ['DEUDA_CORTO_PLAZO', 'DEUDA_LARGO_PLAZO']) {
    const c = { informesSinComponente: 0, conIntereses: 0, otroAnoLoTiene: 0, trimestralLoTiene: 0, conMapeoDescartado: 0, sinNingunaEvidencia: 0, ejemplosConIntereses: [] };
    for (const i of informes) {
      const anio = String(i.fin instanceof Date ? i.fin.toISOString() : i.fin).slice(0, 4);
      if (i.tipo_periodo !== 'ANUAL' || anio < '2022') continue;
      const x = valores.get(i.id);
      if (!x || x.v[k] !== undefined) continue;
      c.informesSinComponente++;
      const intereses = Math.abs(x.v.GASTO_INTERESES ?? 0) > 0;
      const hermanos = porEmpresa.get(i.empresa_id).filter(o => o.id !== i.id);
      const otroAno = hermanos.some(o => o.tipo_periodo === 'ANUAL' && valores.get(o.id)?.v[k] !== undefined);
      const trimestral = hermanos.some(o => o.tipo_periodo === 'TRIMESTRAL' && String(o.fin instanceof Date ? o.fin.toISOString() : o.fin).slice(0, 4) === anio && valores.get(o.id)?.v[k] !== undefined);
      if (intereses) { c.conIntereses++; if (c.ejemplosConIntereses.length < 8) c.ejemplosConIntereses.push(i.id); }
      if (otroAno) c.otroAnoLoTiene++;
      if (trimestral) c.trimestralLoTiene++;
      if (x.crudo.has(k)) c.conMapeoDescartado++;
      if (!intereses && !otroAno && !trimestral && !x.crudo.has(k)) c.sinNingunaEvidencia++;
    }
    r[k] = c;
  }
  console.log(JSON.stringify(r, null, 1));
  await db.end();
})().catch(e => { console.error(e); process.exit(1); });
