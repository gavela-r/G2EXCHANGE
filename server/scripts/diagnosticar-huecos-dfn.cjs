// Diagnóstico de huecos de partidas y del KPI DFN/EBITDA (DEUDA_NETA_SOBRE_EBITDA) en anuales FY2022–2025.
//
// Para cada informe anual sin DFN/EBITDA persistido clasifica la causa con el normalizador y la fórmula reales:
//   SINTETICO_NO_PERSISTIDO  las partidas permiten calcularlo pero el KPI no está guardado (fallo sintético)
//   AMBIGUO                  el normalizador bloquea el informe (TAXONOMIA_AMBIGUA)
//   EBITDA_NO_POSITIVO       entradas completas pero EBITDA <= 0 (exclusión válida de la fórmula)
//   MAPEO_DESCARTADO:<k>     la partida existe en PCV pero la resolución la descarta (nomenclatura/mapeo)
//   AUSENTE:<k>              el concepto no está en PCV para ese informe (falta en la fuente o sin alias)
// También cuenta KPI persistidos que ya no son reproducibles y la cobertura por concepto.
//
// Solo lectura. Uso: node server/scripts/diagnosticar-huecos-dfn.cjs [--pais US|JP|TW] [--json salida.json]
require('dotenv').config({ path: require('node:path').join(__dirname, '../../.env') });
const fs = require('node:fs');
const mysql = require('mysql2/promise');
const { normalizarPartidas } = require('../dist/src/valoracion/datos');
const { kpiCalcularInforme } = require('../dist/insercionDatos/insercionKPIInformeFinanciero');

const args = process.argv.slice(2);
const arg = (k) => (args.includes(k) ? args[args.indexOf(k) + 1] : null);
const PAIS = arg('--pais');
const SALIDA = arg('--json');
const ENTRADAS = ['EBIT', 'DEPRECIACION_AMORTIZACION', 'DEUDA_CORTO_PLAZO', 'DEUDA_LARGO_PLAZO', 'EFECTIVO'];
const NUCLEO = ['INGRESOS', 'BENEFICIO_NETO', 'EBIT', 'DEPRECIACION_AMORTIZACION', 'EFECTIVO', 'DEUDA_CORTO_PLAZO', 'DEUDA_LARGO_PLAZO',
  'ACTIVOS_TOTALES', 'PASIVOS_TOTALES', 'PATRIMONIO_NETO', 'FLUJO_CAJA_OPERATIVO', 'CAPEX', 'GASTO_INTERESES', 'ACCIONES_EN_CIRCULACION'];

const sumar = (obj, k, n = 1) => { obj[k] = (obj[k] ?? 0) + n; };
const top = (obj, n = 15) => Object.fromEntries(Object.entries(obj).sort((a, b) => b[1] - a[1]).slice(0, n));

(async () => {
  const db = await mysql.createConnection({ host: process.env.DB_HOST, port: +process.env.DB_PORT, user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME });
  const [informes] = await db.query(`SELECT i.id, i.fuente, p.codigo_iso pais, i.empresa_id FROM informe_financiero i
    JOIN empresa e ON e.id=i.empresa_id JOIN pais p ON p.id=e.pais_id
    WHERE i.tipo_periodo='ANUAL' AND i.fecha_fin_periodo BETWEEN '2022-01-01' AND '2025-12-31' ${PAIS ? 'AND p.codigo_iso=?' : ''} ORDER BY i.id`, PAIS ? [PAIS] : []);

  const r = {};
  for (let off = 0; off < informes.length; off += 1000) {
    const lote = informes.slice(off, off + 1000), ids = lote.map(x => x.id);
    const [pcv] = await db.query(`SELECT pc.informe_id, pc.concepto, pc.importe, tc.concepto_estandar, tc.signo_esperado, tc.alias_sec, tc.alias_edinet, tc.alias_finmind
      FROM partida_contable_valor pc JOIN taxonomia_concepto tc ON tc.id=pc.concepto_estandar_id WHERE pc.informe_id IN (?) ORDER BY pc.id`, [ids]);
    const [kpis] = await db.query(`SELECT informe_id FROM kpi_financiero_informe WHERE kpi='DEUDA_NETA_SOBRE_EBITDA' AND informe_id IN (?)`, [ids]);
    const conDfn = new Set(kpis.map(k => k.informe_id));
    const porInforme = new Map();
    for (const x of pcv) (porInforme.get(x.informe_id) ?? porInforme.set(x.informe_id, []).get(x.informe_id)).push(x);

    for (const inf of lote) {
      const s = (r[inf.pais] ??= { informes: 0, empresas: new Set(), empresasConDfn: new Set(), conDfnPersistido: 0, persistidoNoReproducible: 0,
        causas: {}, combinaciones: {}, descartadosPorConcepto: {}, coberturaPcv: {}, coberturaNormalizada: {} });
      s.informes++; s.empresas.add(inf.empresa_id);
      const filas = porInforme.get(inf.id) ?? [];
      const crudos = new Map();
      for (const f of filas) (crudos.get(f.concepto_estandar) ?? crudos.set(f.concepto_estandar, []).get(f.concepto_estandar)).push(f.concepto);
      for (const k of NUCLEO) if (crudos.has(k)) sumar(s.coberturaPcv, k);

      let valores = null;
      try { valores = normalizarPartidas(filas, inf.fuente).valores; } catch { valores = null; }
      if (valores) for (const k of NUCLEO) if (valores[k] !== undefined) sumar(s.coberturaNormalizada, k);
      const calc = valores ? kpiCalcularInforme(inf.id, valores).some(k => k.kpi === 'DEUDA_NETA_SOBRE_EBITDA') : false;

      if (conDfn.has(inf.id)) {
        s.conDfnPersistido++; s.empresasConDfn.add(inf.empresa_id);
        if (!calc) s.persistidoNoReproducible++;
        continue;
      }
      if (!valores) { sumar(s.causas, 'AMBIGUO'); continue; }
      if (calc) { sumar(s.causas, 'SINTETICO_NO_PERSISTIDO'); continue; }
      const faltan = ENTRADAS.filter(k => valores[k] === undefined);
      if (!faltan.length) { sumar(s.causas, 'EBITDA_NO_POSITIVO'); continue; }
      const etiquetas = faltan.map(k => {
        if (crudos.has(k)) {
          for (const c of crudos.get(k)) sumar(s.descartadosPorConcepto, `${k} <- ${c.split(':').pop()}`);
          return `MAPEO_DESCARTADO:${k}`;
        }
        return `AUSENTE:${k}`;
      });
      for (const e of etiquetas) sumar(s.causas, e);
      sumar(s.combinaciones, etiquetas.join(' + '));
    }
    process.stderr.write(`\r${Math.min(off + 1000, informes.length)}/${informes.length}`);
  }

  const salida = {};
  for (const [pais, s] of Object.entries(r)) {
    const pct = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, `${(v / s.informes * 100).toFixed(1)}%`]));
    salida[pais] = {
      informes: s.informes, empresas: s.empresas.size, empresasConDfn: s.empresasConDfn.size,
      conDfnPersistido: s.conDfnPersistido, coberturaDfn: `${(s.conDfnPersistido / s.informes * 100).toFixed(1)}%`,
      persistidoNoReproducible: s.persistidoNoReproducible,
      causasSinDfn: top(s.causas, 30), combinaciones: top(s.combinaciones, 12), descartadosPorConcepto: top(s.descartadosPorConcepto, 20),
      coberturaPcv: pct(s.coberturaPcv), coberturaNormalizada: pct(s.coberturaNormalizada),
    };
  }
  process.stderr.write('\n');
  console.log(JSON.stringify(salida, null, 1));
  if (SALIDA) fs.writeFileSync(SALIDA, JSON.stringify(salida, null, 1));
  await db.end();
})().catch(e => { console.error(e); process.exit(1); });
