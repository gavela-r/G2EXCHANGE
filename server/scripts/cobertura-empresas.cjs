// Cobertura por empresa y país, sobre el informe ANUAL más reciente de cada empresa (cierre 2022–2025).
//   nucleo       : los 6 datos del núcleo de valoración (INGRESOS, EBIT, D&A, ACCIONES, DEUDA_TOTAL, EFECTIVO)
//   fundamentales: las 13 partidas clave normalizadas (deuda total, por componentes o agregado publicado) + KPI DFN/EBITDA
//   completo     : fundamentales + los 18 KPI propios calculados (FONDO_MANIOBRA aparte: aún solo TW)
// También cuenta empresas con precio y con valoración completada. Solo lectura.
// Uso: node server/scripts/cobertura-empresas.cjs
require('dotenv').config({ path: require('node:path').join(__dirname, '../../.env') });
const mysql = require('mysql2/promise');
const { normalizarPartidas } = require('../dist/src/valoracion/datos');
const { kpiCalcularInforme } = require('../dist/insercionDatos/insercionKPIInformeFinanciero');

const NUCLEO = ['INGRESOS', 'EBIT', 'DEPRECIACION_AMORTIZACION', 'ACCIONES_EN_CIRCULACION', 'DEUDA_TOTAL', 'EFECTIVO'];
const PARTIDAS = ['INGRESOS', 'BENEFICIO_NETO', 'EBIT', 'DEPRECIACION_AMORTIZACION', 'EFECTIVO', 'DEUDA_TOTAL',
  'ACTIVOS_TOTALES', 'PASIVOS_TOTALES', 'PATRIMONIO_NETO', 'FLUJO_CAJA_OPERATIVO', 'CAPEX', 'GASTO_INTERESES', 'ACCIONES_EN_CIRCULACION'];
const KPIS = 18;

(async () => {
  const db = await mysql.createConnection({ host: process.env.DB_HOST, port: +process.env.DB_PORT, user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME });
  const [empresas] = await db.query(`SELECT e.id, p.codigo_iso pais,
      EXISTS (SELECT 1 FROM instrumento i JOIN cotizacion_diaria c ON c.instrumento_id=i.id WHERE i.empresa_id=e.id) con_precio,
      EXISTS (SELECT 1 FROM valuation_run v WHERE v.empresa_id=e.id AND v.estado='COMPLETADO') valorada
    FROM empresa e JOIN pais p ON p.id=e.pais_id WHERE p.codigo_iso IN ('US','JP','TW')`);
  const [ultimos] = await db.query(`SELECT id, empresa_id, fuente FROM (
      SELECT i.id, i.empresa_id, i.fuente, ROW_NUMBER() OVER (PARTITION BY i.empresa_id ORDER BY i.fecha_fin_periodo DESC, i.id DESC) rn
      FROM informe_financiero i WHERE i.tipo_periodo='ANUAL' AND i.fecha_fin_periodo BETWEEN '2022-01-01' AND '2025-12-31') x WHERE rn=1`);
  const ultimo = new Map(ultimos.map(u => [u.empresa_id, u]));
  const res = new Map();
  for (let off = 0; off < ultimos.length; off += 2000) {
    const lote = ultimos.slice(off, off + 2000), ids = lote.map(x => x.id);
    const [pcv] = await db.query(`SELECT pc.informe_id, pc.concepto, pc.importe, tc.concepto_estandar, tc.signo_esperado, tc.alias_sec, tc.alias_edinet, tc.alias_finmind
      FROM partida_contable_valor pc JOIN taxonomia_concepto tc ON tc.id=pc.concepto_estandar_id WHERE pc.informe_id IN (?)`, [ids]);
    const g = new Map();
    for (const x of pcv) (g.get(x.informe_id) ?? g.set(x.informe_id, []).get(x.informe_id)).push(x);
    for (const inf of lote) {
      let v;
      try { v = normalizarPartidas(g.get(inf.id) ?? [], inf.fuente).valores; } catch { res.set(inf.id, null); continue; }
      const kpis = kpiCalcularInforme(inf.id, v).map(k => k.kpi);
      const deudaTotal = v.DEUDA_TOTAL !== undefined;
      res.set(inf.id, {
        nucleo: NUCLEO.every(k => (k === 'DEUDA_TOTAL' ? deudaTotal : v[k] !== undefined)),
        fundamentales: PARTIDAS.every(k => v[k] !== undefined) && kpis.includes('DEUDA_NETA_SOBRE_EBITDA'),
        completo: PARTIDAS.every(k => v[k] !== undefined) && kpis.includes('DEUDA_NETA_SOBRE_EBITDA') && kpis.filter(k => k !== 'FONDO_MANIOBRA').length >= KPIS,
      });
    }
  }
  const t = {};
  for (const e of empresas) {
    const s = (t[e.pais] ??= { empresas: 0, conPrecio: 0, conAnual2022_2025: 0, nucleo: 0, fundamentales: 0, completo: 0, valoradas: 0 });
    s.empresas++; if (e.con_precio) s.conPrecio++; if (e.valorada) s.valoradas++;
    const u = ultimo.get(e.id);
    if (!u) continue;
    s.conAnual2022_2025++;
    const r = res.get(u.id);
    if (r?.nucleo) s.nucleo++;
    if (r?.fundamentales) s.fundamentales++;
    if (r?.completo) s.completo++;
  }
  console.log(JSON.stringify(t, null, 1));
  await db.end();
})().catch(e => { console.error(e); process.exit(1); });
