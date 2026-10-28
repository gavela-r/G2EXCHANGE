const path = require('node:path');
const fs = require('node:fs');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
const pool = require('../dist/conexion/bd').default;
const { normalizarPartidas } = require('../dist/src/valoracion/datos');
const { kpiCalcularInforme } = require('../dist/insercionDatos/insercionKPIInformeFinanciero');
const YEARS = [2022, 2023, 2024, 2025];
const CORE = [
  'INGRESOS', 'BENEFICIO_BRUTO', 'EBIT', 'BENEFICIO_NETO', 'GASTO_INTERESES',
  'EFECTIVO', 'ACTIVOS_TOTALES', 'PASIVOS_TOTALES', 'PATRIMONIO_NETO',
  'DEUDA_CORTO_PLAZO', 'DEUDA_LARGO_PLAZO', 'FLUJO_CAJA_OPERATIVO', 'CAPEX',
  'DEPRECIACION_AMORTIZACION', 'INVENTARIOS', 'CUENTAS_COBRAR', 'CUENTAS_PAGAR'
];
const KPI_EXPECTED = [
  'MARGEN_BRUTO', 'MARGEN_EBIT', 'MARGEN_NETO', 'ROA', 'ROE', 'DEUDA_TOTAL',
  'DEUDA_NETA', 'DEUDA_SOBRE_PATRIMONIO', 'DEUDA_SOBRE_ACTIVOS',
  'COBERTURA_INTERESES', 'EBITDA', 'MARGEN_EBITDA', 'FCF', 'MARGEN_FCF',
  'CAPITAL_CIRCULANTE_OPERATIVO', 'CAPITAL_CIRCULANTE_OPERATIVO_SOBRE_INGRESOS',
  'PASIVO_SOBRE_ACTIVOS'
];
const pct = (n, d) => d ? Number((100 * n / d).toFixed(4)) : null;

async function main() {
  const connection=await pool.getConnection();
  await connection.query('START TRANSACTION WITH CONSISTENT SNAPSHOT');
  const databaseSnapshotAt=new Date().toISOString();
  try {
  console.log('PCV/KPI audit: reading countries and taxonomy');
  const [countries] = await connection.query("SELECT id,codigo_iso FROM pais WHERE codigo_iso IN ('US','JP')");
  if (countries.length !== 2) throw new Error('No se encontraron exactamente US y JP en pais');
  const [taxRows] = await connection.query('SELECT concepto_estandar,alias_sec,alias_edinet,categoria,unidad_tipo FROM taxonomia_concepto WHERE activo=1');
  const sourceExpected = {
    US: taxRows.filter(t => t.alias_sec && !['CALCULADO', 'NO_DISPONIBLE'].includes(String(t.alias_sec).toUpperCase()) && t.categoria !== 'RATIO').map(t => t.concepto_estandar),
    JP: taxRows.filter(t => t.alias_edinet && !['CALCULADO', 'NO_DISPONIBLE'].includes(String(t.alias_edinet).toUpperCase()) && t.categoria !== 'RATIO').map(t => t.concepto_estandar)
  };
  const [targets] = await connection.query(`SELECT e.id empresa_id,p.codigo_iso FROM empresa e JOIN pais p ON p.id=e.pais_id WHERE p.codigo_iso IN ('US','JP')`);
  console.log(`PCV/KPI audit: ${targets.length} target companies; selecting annual reports`);
  const targetCounts = Object.fromEntries(['US','JP'].map(c => [c, targets.filter(x => x.codigo_iso === c).length]));
  const [reports] = await connection.query(`
    WITH ranked AS (
      SELECT inf.id informe_id,inf.empresa_id,YEAR(inf.fecha_fin_periodo) ejercicio,inf.fecha_fin_periodo,inf.fecha_publicacion,inf.fuente,
             ROW_NUMBER() OVER(PARTITION BY inf.empresa_id,YEAR(inf.fecha_fin_periodo) ORDER BY inf.fecha_fin_periodo DESC,inf.fecha_publicacion DESC,inf.id DESC) rn
      FROM informe_financiero inf JOIN empresa e ON e.id=inf.empresa_id JOIN pais p ON p.id=e.pais_id
      WHERE p.codigo_iso IN ('US','JP') AND inf.tipo_periodo='ANUAL' AND YEAR(inf.fecha_fin_periodo) BETWEEN 2022 AND 2025
    ) SELECT r.*,e.nombre_empresa,p.codigo_iso FROM ranked r JOIN empresa e ON e.id=r.empresa_id JOIN pais p ON p.id=e.pais_id WHERE r.rn=1 ORDER BY p.codigo_iso,r.ejercicio,r.empresa_id`,
  );
  const reportIds = reports.map(r => Number(r.informe_id));
  console.log(`PCV/KPI audit: ${reports.length} annual company-years; loading PCV/KPI`);
  const pcvByReport = new Map(), kpiByReport = new Map();
  if (reportIds.length) {
    const marks = reportIds.map(() => '?').join(',');
    const [parts] = await connection.query(`SELECT pc.informe_id,pc.id,pc.concepto,pc.concepto_estandar_id,pc.importe,pc.nivel_confianza,tc.concepto_estandar,tc.signo_esperado,tc.alias_sec,tc.alias_edinet,tc.alias_finmind FROM partida_contable_valor pc LEFT JOIN taxonomia_concepto tc ON tc.id=pc.concepto_estandar_id WHERE pc.informe_id IN (${marks})`, reportIds);
    console.log(`PCV/KPI audit: loaded ${parts.length} PCV rows; loading KPI`);
    for (const x of parts) { if (!pcvByReport.has(Number(x.informe_id))) pcvByReport.set(Number(x.informe_id), []); pcvByReport.get(Number(x.informe_id)).push(x); }
    const [kpis] = await connection.query(`SELECT informe_id,kpi,valor,unidad FROM kpi_financiero_informe WHERE informe_id IN (${marks})`, reportIds);
    console.log(`PCV/KPI audit: loaded ${kpis.length} KPI rows; calculating coverage`);
    for (const x of kpis) { if (!kpiByReport.has(Number(x.informe_id))) kpiByReport.set(Number(x.informe_id), []); kpiByReport.get(Number(x.informe_id)).push(x); }
  }
  const output = { generated_at: new Date().toISOString(), database: process.env.DB_NAME, definition: { target_universe: 'Todas las empresas en empresa de US/JP; instrumentos contados por separado', report_selection: 'Un informe anual por empresa y año civil de fecha_fin_periodo: el cierre/publicación/id más reciente', pcv_valid: 'presencia de importe no NULL/finito en concepto del catálogo; un slot por concepto; conflictos de importes informados aparte', pcv_expected: 'catálogo real de taxonomía con alias del proveedor principal (SEC/EDINET), sin ratios calculados; es proxy de cobertura de catálogo, no afirmación de aplicabilidad legal por empresa', core_required: CORE, kpi_expected: KPI_EXPECTED, note: 'Las ausencias por no aplicabilidad no son separables con el esquema actual y no se declaran como errores de proveedor.' }, targets: targetCounts, taxonomy_catalog_sizes: { US: sourceExpected.US.length, JP: sourceExpected.JP.length }, periods: {}, aggregates: {}, four_year_companies: {}, source_import_breakdown: 'Legado sin proveedor por fila; nuevas operaciones atribuibles mediante pcv_import_evidence' };
  for (const country of ['US','JP']) {
    for (const year of YEARS) {
      const targetCompanies = targetCounts[country];
      const rs = reports.filter(r => r.codigo_iso === country && Number(r.ejercicio) === year);
      let reportsWithPcv=0, pcvValid=0, pcvExpected=0, reportsCoreComplete=0, pcvCorePresent=0, kpivailable=0, kpiCalculable=0, kpiExpected=0, kpiMissing=0, rowsWithPcv=0;
      const perCompany = new Map();
      const missingConcepts={};
      for (const r of rs) {
        const parts = pcvByReport.get(Number(r.informe_id)) || [];
        const source = r.fuente;
        let values = {};
        let normalizationError = null;
        try {
          values = normalizarPartidas(parts.filter(p => p.concepto_estandar), source).valores;
        } catch (error) {
          normalizationError = error instanceof Error ? error.message : String(error);
        }
        const expected = sourceExpected[country];
        const presentSet = new Set(parts.filter(p => expected.includes(p.concepto_estandar) && p.importe !== null && Number.isFinite(Number(p.importe))).map(p => p.concepto_estandar));
        const corePresent = CORE.filter(c => presentSet.has(c));
        for(const code of expected)if(!presentSet.has(code))missingConcepts[code]=(missingConcepts[code]||0)+1;
        const calculated = normalizationError ? [] : kpiCalcularInforme(Number(r.informe_id), values);
        const calculatedSet = new Set(calculated.map(x => x.kpi));
        const existingSet = new Set((kpiByReport.get(Number(r.informe_id)) || []).filter(x => x.valor !== null).map(x => x.kpi));
        if (parts.length) {reportsWithPcv++; rowsWithPcv++;}
        pcvValid += presentSet.size;
        pcvExpected += expected.length;
        pcvCorePresent += corePresent.length;
        if (CORE.every(c => presentSet.has(c))) reportsCoreComplete++;
        kpiExpected += KPI_EXPECTED.length;
        kpiCalculable += calculatedSet.size;
        kpivailable += KPI_EXPECTED.filter(k => existingSet.has(k)).length;
        kpiMissing += KPI_EXPECTED.filter(k => !existingSet.has(k) && calculatedSet.has(k)).length;
        perCompany.set(Number(r.empresa_id), { coreComplete: CORE.every(c => presentSet.has(c)), allExpected: expected.every(c => presentSet.has(c)), normalizationError });
      }
      output.periods[`${country}-${year}`] = { target_companies: targetCompanies, companies_with_annual_report: rs.length, companies_without_annual_report:targetCompanies-rs.length, companies_with_any_pcv: reportsWithPcv, companies_all_core_17: reportsCoreComplete, companies_with_incomplete_core:rs.length-reportsCoreComplete, reports_with_pcv: reportsWithPcv, valid_pcv_present: pcvValid, expected_pcv_catalog_slots: pcvExpected, missing_pcv_catalog_slots: Math.max(0,pcvExpected-pcvValid), missing_by_concept:missingConcepts, pcv_coverage_pct: pct(pcvValid,pcvExpected), core_17_slots_present: pcvCorePresent, core_17_slots_expected: rs.length*CORE.length, core_17_slot_coverage_pct: pct(pcvCorePresent,rs.length*CORE.length), existing_kpi_available: kpivailable, missing_kpi_total:rs.length*KPI_EXPECTED.length-kpivailable, calculated_kpi_slots: kpiCalculable, missing_kpi_calculable_existing: kpiMissing, expected_kpi_slots: rs.length*KPI_EXPECTED.length, kpi_coverage_pct: pct(kpivailable,rs.length*KPI_EXPECTED.length), reports_with_four_year_sequence: null, companies_with_all_catalog_pcv: [...perCompany.values()].filter(x=>x.allExpected).length, reports_without_pcv: rs.length-reportsWithPcv, normalization_conflicts: [...perCompany.values()].filter(x=>x.normalizationError).length };
    }
    for(const year of YEARS){const p=output.periods[`${country}-${year}`];p.target_universe_pcv_slots=p.target_companies*sourceExpected[country].length;p.target_universe_kpi_slots=p.target_companies*KPI_EXPECTED.length;p.target_universe_pcv_coverage_pct=pct(p.valid_pcv_present,p.target_universe_pcv_slots);p.target_universe_kpi_coverage_pct=pct(p.existing_kpi_available,p.target_universe_kpi_slots);}
    const keys=YEARS.map(y=>`${country}-${y}`), agg=keys.map(k=>output.periods[k]);
    const pcv=agg.reduce((a,x)=>a+x.valid_pcv_present,0), expected=agg.reduce((a,x)=>a+x.expected_pcv_catalog_slots,0), kpi=agg.reduce((a,x)=>a+x.existing_kpi_available,0), kpiExp=agg.reduce((a,x)=>a+x.expected_kpi_slots,0);
    const complete=targets.filter(t=>t.codigo_iso===country).filter(t=>YEARS.every(y=>reports.some(r=>r.codigo_iso===country&&Number(r.empresa_id)===Number(t.empresa_id)&&Number(r.ejercicio)===y))).length;
    output.aggregates[country]={target_companies:targetCounts[country],pcv_valid_present:pcv,pcv_expected_catalog_slots:expected,pcv_missing_catalog_slots:Math.max(0,expected-pcv),pcv_coverage_pct:pct(pcv,expected),kpi_existing_available:kpi,kpi_expected_slots:kpiExp,kpi_coverage_pct:pct(kpi,kpiExp),companies_with_four_annual_reports_2022_2025:complete,companies_with_four_years_and_all_core_17:targets.filter(t=>t.codigo_iso===country).filter(t=>YEARS.every(y=>{const r=reports.find(r=>r.codigo_iso===country&&Number(r.empresa_id)===Number(t.empresa_id)&&Number(r.ejercicio)===y);return r&&(pcvByReport.get(Number(r.informe_id))||[]).length>0&&CORE.every(c=>(pcvByReport.get(Number(r.informe_id))||[]).some(p=>p.concepto_estandar===c&&p.importe!==null));})).length};
  }
  for(const country of ['US','JP']){const a=output.aggregates[country];a.target_universe_pcv_coverage_pct=pct(a.pcv_valid_present,targetCounts[country]*YEARS.length*sourceExpected[country].length);a.target_universe_kpi_coverage_pct=pct(a.kpi_existing_available,targetCounts[country]*YEARS.length*KPI_EXPECTED.length);}
  const [reportLedger]=await connection.query("SHOW TABLES LIKE 'financial_report_evidence'");
  if(reportLedger.length)output.new_annual_reports=(await connection.query("SELECT e.provider,p.codigo_iso,YEAR(i.fecha_fin_periodo) year,COUNT(*) reports,COUNT(DISTINCT i.empresa_id) companies FROM financial_report_evidence e JOIN informe_financiero i ON i.id=e.informe_id JOIN empresa en ON en.id=i.empresa_id JOIN pais p ON p.id=en.pais_id GROUP BY e.provider,p.codigo_iso,YEAR(i.fecha_fin_periodo)"))[0];
  const outDir=path.resolve(__dirname,'../../private_backups');
  output.database_snapshot_at=databaseSnapshotAt;
  const [ledgers]=await connection.query("SHOW TABLES LIKE 'pcv_import_evidence'");
  if(ledgers.length){
   output.providers=(await connection.query("SELECT e.provider,e.record_type,COUNT(*) records,COUNT(DISTINCT e.informe_id) reports,COUNT(DISTINCT i.empresa_id) companies,SUM(JSON_TYPE(JSON_EXTRACT(e.evidence_json,'$.before'))='NULL') new_rows FROM pcv_import_evidence e JOIN informe_financiero i ON i.id=e.informe_id GROUP BY e.provider,e.record_type"))[0];
   output.beneficiaries=(await connection.query("SELECT p.codigo_iso,COUNT(DISTINCT i.empresa_id) companies,COUNT(DISTINCT e.informe_id) reports FROM pcv_import_evidence e JOIN informe_financiero i ON i.id=e.informe_id JOIN empresa en ON en.id=i.empresa_id JOIN pais p ON p.id=en.pais_id WHERE e.record_type='PCV' GROUP BY p.codigo_iso"))[0];
  }
  const label=process.argv.includes('--after')?'after':process.argv.includes('--baseline')?'baseline-verified':'before';
  const file=path.join(outDir,`pcv-kpi-audit-${label}-2022-2025.json`);
  if(fs.existsSync(file)&&!process.argv.includes('--after'))throw new Error('Auditoría existente conservada; usar un archivo nuevo');
  fs.writeFileSync(file,JSON.stringify(output,null,2));
  console.log(`PCV/KPI audit saved: ${file}`);
  console.log(JSON.stringify({file,targets:output.targets,periods:output.periods,aggregates:output.aggregates,taxonomy_catalog_sizes:output.taxonomy_catalog_sizes,definitions:output.definition},null,2));
  } finally { await connection.rollback(); connection.release(); }
}
main().catch(e=>{ console.error(e.message); process.exitCode=1; }).finally(()=>pool.end());
