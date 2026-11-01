// Auditoría Fase 2. No importa backend, escritores ni recuperadores.
// Únicas órdenes permitidas: SELECT/SHOW/EXPLAIN y controles exactos de sesión/transacción.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const cp = require('node:child_process');
const root = path.resolve(__dirname, '../../../..');
const out = path.join(__dirname, 'evidencias');
fs.mkdirSync(out, { recursive: true });
require(path.join(root, 'server/node_modules/dotenv')).config({ path: path.join(root, '.env') });
const mysql = require(path.join(root, 'server/node_modules/mysql2/promise'));
const sha = x => crypto.createHash('sha256').update(x).digest('hex');
const save = (name, data) => fs.writeFileSync(path.join(out, name + '.json'), JSON.stringify(data, null, 2) + '\n');
const phase1 = path.resolve(__dirname, '..');
function walk(dir) { return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory()
  ? (['dist', 'fase2'].includes(e.name) ? [] : walk(path.join(dir, e.name))) : [path.join(dir, e.name)]); }
function hashes() {
  const g = cp.spawnSync('git', ['-c', `safe.directory=${root.replaceAll('\\', '/')}`, '-C', root, 'ls-files', '-z'], { encoding: 'utf8' });
  if (g.status) throw new Error('No se pudo enumerar inventario protegido');
  const files = [...new Set([...g.stdout.split('\0').filter(Boolean).map(f => path.join(root, f)), ...walk(phase1)])].sort();
  return Object.fromEntries(files.filter(f => fs.existsSync(f) && fs.statSync(f).isFile()).map(f => [path.relative(root, f).replaceAll('\\', '/'), sha(fs.readFileSync(f))]));
}
const controls = new Set(['SET SESSION MAX_EXECUTION_TIME=2000', 'SET SESSION TRANSACTION ISOLATION LEVEL READ COMMITTED',
  'SET SESSION TRANSACTION READ ONLY', 'SET SESSION lock_wait_timeout=2', 'SET SESSION innodb_lock_wait_timeout=2',
  'START TRANSACTION READ ONLY', 'ROLLBACK']);
const log = [];
let c;
async function sql(label, query, params = []) {
  if (!controls.has(query) && !/^(SELECT|SHOW|EXPLAIN)\s/i.test(query)) throw new Error('SQL fuera de lista de lectura');
  if (query.includes(';')) throw new Error('No se admiten sentencias múltiples');
  const started = Date.now();
  try {
    const [rows] = await c.query({ sql: query, values: params, timeout: 3500 });
    log.push({ label, sql: query, parameters: params, ms: Date.now() - started, rows: Array.isArray(rows) ? rows.length : null, outcome: 'OK' });
    return rows;
  } catch (e) {
    log.push({ label, sql: query, parameters: params, ms: Date.now() - started, outcome: e.code || e.name });
    throw e;
  }
}
async function read(label, query, params = []) {
  await sql('transaction_begin', 'START TRANSACTION READ ONLY');
  try { return await sql(label, query, params); }
  finally { await sql('transaction_end', 'ROLLBACK'); }
}
async function connect() {
  const readKey = ['DB_READONLY_USER', 'DB_READ_ONLY_USER', 'DB_RO_USER', 'MYSQL_READONLY_USER'].find(k => process.env[k] && process.env[k.replace(/USER$/, 'PASSWORD')]);
  c = await mysql.createConnection({ host: process.env.DB_HOST || 'localhost', port: Number(process.env.DB_PORT || 3307),
    user: readKey ? process.env[readKey] : process.env.DB_USER, password: readKey ? process.env[readKey.replace(/USER$/, 'PASSWORD')] : process.env.DB_PASSWORD,
    database: process.env.DB_NAME, dateStrings: true, connectTimeout: 4000, enableKeepAlive: false });
  for (const q of [...controls].filter(q => q.startsWith('SET '))) await sql('session_control', q);
  const identity = await read('identity', 'SELECT DATABASE() schema_name,@@version mysql_version,@@session.transaction_read_only session_read_only,@@session.max_execution_time max_execution_time,@@session.transaction_isolation isolation_level,NOW() server_time');
  if (Number(identity[0].session_read_only) !== 1) throw new Error('La sesión no declara READ ONLY');
  const grants = await read('grants', 'SHOW GRANTS');
  const beyondSelect = grants.some(g => /ALL PRIVILEGES|\b(INSERT|UPDATE|DELETE|CREATE|DROP|ALTER|EXECUTE|SUPER|FILE|GRANT OPTION)\b/.test(Object.values(g).join(' ')));
  return { ...identity[0], dedicatedReadOnlyConfiguration: !!readKey, accountHasPermissionsBeyondRead: beyondSelect,
    safeguard: 'SET SESSION TRANSACTION READ ONLY + START TRANSACTION READ ONLY por consulta; ROLLBACK inmediato; MAX_EXECUTION_TIME 2000 ms; timeout cliente 3500 ms' };
}
async function metadata() {
  const identity = await connect();
  const tables = await read('tables', 'SELECT TABLE_NAME,TABLE_TYPE,ENGINE,TABLE_ROWS,DATA_LENGTH,INDEX_LENGTH FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() ORDER BY TABLE_NAME LIMIT 150');
  const columns = await read('columns', 'SELECT TABLE_NAME,COLUMN_NAME,ORDINAL_POSITION,COLUMN_TYPE,IS_NULLABLE,COLUMN_DEFAULT,COLUMN_KEY,EXTRA FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() ORDER BY TABLE_NAME,ORDINAL_POSITION LIMIT 1500');
  const indexes = await read('indexes', 'SELECT TABLE_NAME,INDEX_NAME,NON_UNIQUE,SEQ_IN_INDEX,COLUMN_NAME,INDEX_TYPE,CARDINALITY FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() ORDER BY TABLE_NAME,INDEX_NAME,SEQ_IN_INDEX LIMIT 1000');
  const relationships = await read('relationships', 'SELECT TABLE_NAME,CONSTRAINT_NAME,COLUMN_NAME,REFERENCED_TABLE_NAME,REFERENCED_COLUMN_NAME,ORDINAL_POSITION FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA=DATABASE() ORDER BY TABLE_NAME,CONSTRAINT_NAME,ORDINAL_POSITION LIMIT 1000');
  const checks = await read('checks', 'SELECT tc.TABLE_NAME,tc.CONSTRAINT_NAME,tc.CONSTRAINT_TYPE,cc.CHECK_CLAUSE FROM information_schema.TABLE_CONSTRAINTS tc LEFT JOIN information_schema.CHECK_CONSTRAINTS cc ON cc.CONSTRAINT_SCHEMA=tc.CONSTRAINT_SCHEMA AND cc.CONSTRAINT_NAME=tc.CONSTRAINT_NAME WHERE tc.CONSTRAINT_SCHEMA=DATABASE() ORDER BY tc.TABLE_NAME,tc.CONSTRAINT_NAME LIMIT 500');
  const ddl = {};
  for (const t of tables.map(x => x.TABLE_NAME).filter(t => t !== 'usuario')) ddl[t] = (await read('ddl_' + t, 'SHOW CREATE TABLE `' + t + '`'))[0]['Create Table'];
  const counts = {};
  for (const t of ['empresa', 'sector', 'pais', 'instrumento', 'cotizacion_diaria', 'informe_financiero', 'valuation_input_version', 'valuation_input_snapshot', 'coste_capital_referencia', 'rating_sintetico', 'valuation_execution', 'valuation_run', 'valuation_run_parametros', 'model_version', 'taxonomia_concepto', 'evento_corporativo']) {
    if (tables.some(x => x.TABLE_NAME === t)) counts[t] = (await read('count_' + t, 'SELECT COUNT(*) n FROM `' + t + '`'))[0].n;
  }
  const quotes = {
    totals: await read('quotes_totals', 'SELECT COUNT(*) filas,COUNT(DISTINCT instrumento_id) instrumentos,COUNT(DISTINCT fecha) fechas_globales,MIN(fecha) fecha_min,MAX(fecha) fecha_max,SUM(precio_cierre>0) precios_positivos,SUM(precio_cierre IS NULL) precios_null,SUM(fecha IS NULL) fechas_null FROM cotizacion_diaria'),
    perInstrumentDistribution: await read('quotes_per_instrument', 'SELECT fechas_distintas,filas,COUNT(*) instrumentos FROM (SELECT instrumento_id,COUNT(DISTINCT fecha) fechas_distintas,COUNT(*) filas FROM cotizacion_diaria GROUP BY instrumento_id) x GROUP BY fechas_distintas,filas LIMIT 30'),
    byCountry: await read('quotes_country', 'SELECT p.codigo_iso,COUNT(DISTINCT e.id) empresas_registradas,COUNT(DISTINCT i.id) instrumentos,COUNT(q.id) cotizaciones,COUNT(DISTINCT CASE WHEN q.precio_cierre>0 AND q.fecha IS NOT NULL THEN e.id END) empresas_con_precio,MIN(q.fecha) fecha_min,MAX(q.fecha) fecha_max FROM empresa e LEFT JOIN pais p ON p.id=e.pais_id LEFT JOIN instrumento i ON i.empresa_id=e.id LEFT JOIN cotizacion_diaria q ON q.instrumento_id=i.id GROUP BY p.codigo_iso LIMIT 15'),
    byDate: await read('quotes_dates', 'SELECT fecha,COUNT(*) filas FROM cotizacion_diaria GROUP BY fecha ORDER BY fecha DESC LIMIT 60')
  };
  const taxonomy = await read('taxonomy', 'SELECT id,concepto_estandar,categoria,unidad_tipo,signo_esperado,activo FROM taxonomia_concepto ORDER BY id LIMIT 200');
  const evidenceShape = {};
  for (const t of ['financial_report_evidence', 'pcv_import_evidence', 'pcv_verification_evidence', 'classification_evidence']) {
    if (tables.some(x => x.TABLE_NAME === t)) evidenceShape[t] = await read('shape_' + t, 'SELECT id,JSON_KEYS(evidence_json) root_keys FROM `' + t + '` ORDER BY id DESC LIMIT 3');
  }
  save('metadatos', { capturedAtUtc: new Date().toISOString(), identity, tables, columns, indexes, relationships, checks, ddl, counts, quotes, taxonomy, evidenceShape });
  console.log(JSON.stringify({ stage: 'metadata', counts, identity, quotes, evidenceShape }, null, 2));
}
async function contextProbe() {
  const identity = await connect();
  const reports = await read('report_population', "SELECT p.codigo_iso,f.tipo_periodo,YEAR(f.fecha_fin_periodo) ejercicio,COUNT(*) informes,COUNT(DISTINCT f.empresa_id) empresas,SUM(f.fecha_publicacion IS NULL) sin_publicacion,SUM(f.fecha_publicacion<f.fecha_fin_periodo) publicacion_anterior_cierre FROM informe_financiero f JOIN empresa e ON e.id=f.empresa_id JOIN pais p ON p.id=e.pais_id GROUP BY p.codigo_iso,f.tipo_periodo,YEAR(f.fecha_fin_periodo) ORDER BY p.codigo_iso,ejercicio LIMIT 300");
  const samples = {};
  for (const country of ['US', 'JP', 'TW']) {
    const ids = (await read('sample_context_ids_' + country, 'SELECT re.id FROM financial_report_evidence re JOIN empresa e ON e.id=re.empresa_id JOIN pais p ON p.id=e.pais_id WHERE p.codigo_iso=? ORDER BY re.id DESC LIMIT 2', [country])).map(r => r.id);
    samples[country] = ids.length ? await read('sample_context_' + country, `SELECT re.id,re.informe_id,re.provider,JSON_EXTRACT(re.evidence_json,'$.context') context,JSON_KEYS(JSON_EXTRACT(re.evidence_json,'$.metadata')) metadata_keys,JSON_KEYS(JSON_EXTRACT(re.evidence_json,'$.identity')) identity_keys,f.fecha_fin_periodo,f.fecha_publicacion FROM financial_report_evidence re JOIN informe_financiero f ON f.id=re.informe_id WHERE re.id IN (${ids.map(() => '?')}) LIMIT 2`, ids) : [];
    // Solo estructura y campos financieros/contextuales; no URLs ni credenciales de evidencia.
    const ver = (await read('sample_verified_ids_' + country, "SELECT v.id FROM pcv_verification_evidence v JOIN informe_financiero f ON f.id=v.informe_id JOIN empresa e ON e.id=f.empresa_id JOIN pais p ON p.id=e.pais_id WHERE p.codigo_iso=? AND v.outcome IN ('INSERTED','NULL_FILLED','VERIFIED_EXISTING') ORDER BY v.id DESC LIMIT 2", [country])).map(r => r.id);
    samples[country + '_verification'] = ver.length ? await read('sample_verified_' + country, `SELECT id,informe_id,concept_code,outcome,JSON_EXTRACT(evidence_json,'$.context') context,JSON_EXTRACT(evidence_json,'$.evidence.record_id') record_id,JSON_EXTRACT(evidence_json,'$.evidence.record_ids') record_ids,JSON_EXTRACT(evidence_json,'$.evidence.candidate.importe') amount,JSON_EXTRACT(evidence_json,'$.evidence.candidate.currency') currency,JSON_EXTRACT(evidence_json,'$.evidence.candidate.basis') basis,JSON_EXTRACT(evidence_json,'$.evidence.candidate.evidence.start') start,JSON_EXTRACT(evidence_json,'$.evidence.candidate.evidence.end') end,JSON_EXTRACT(evidence_json,'$.evidence.candidate.evidence.scale') scale,JSON_EXTRACT(evidence_json,'$.evidence.candidate.evidence.filed') filed FROM pcv_verification_evidence WHERE id IN (${ver.map(() => '?')}) LIMIT 2`, ver) : [];
  }
  const reference = {
    countries: await read('country_references', 'SELECT id,codigo_iso,interes_bono_10_ano,fecha_publicacion_bono10,tasa_impositiva,equity_risk_premium,prima_riesgo_mercado,riesgo_extra_por_pais,fecha_actualizacion_prima_mercado,fuente_prima_mercado FROM pais ORDER BY id LIMIT 10'),
    sectors: await read('sector_references', 'SELECT s.id,s.nombre_sector,s.sensibilidad_al_mercado,COUNT(e.id) empresas FROM sector s LEFT JOIN empresa e ON e.sector_id=s.id GROUP BY s.id ORDER BY empresas DESC LIMIT 100'),
    credit: await read('credit_references', 'SELECT perfil_empresa,COUNT(*) filas,SUM(activo=1) activas,MIN(fecha_datos_mercado) fecha_min,MAX(fecha_datos_mercado) fecha_max,MIN(spread_credito_base) spread_min,MAX(spread_credito_base) spread_max,fuente_intervalos,fuente_spread_mercado FROM rating_sintetico GROUP BY perfil_empresa,fuente_intervalos,fuente_spread_mercado LIMIT 30'),
    cost: await read('cost_references', 'SELECT pais_id,COUNT(*) filas,COUNT(DISTINCT sector_id) sectores,MIN(fecha_calculo) fecha_min,MAX(fecha_calculo) fecha_max,SUM(ke_referencia IS NULL) ke_null,SUM(equity_risk_premium IS NULL) erp_null FROM coste_capital_referencia GROUP BY pais_id LIMIT 10'),
    events: await read('events', 'SELECT tipo_evento,COUNT(*) filas,COUNT(DISTINCT instrumento_id) instrumentos,MIN(fecha) fecha_min,MAX(fecha) fecha_max FROM evento_corporativo GROUP BY tipo_evento LIMIT 30'),
    snapshots: await read('snapshot_prices', 'SELECT COUNT(*) filas,COUNT(DISTINCT empresa_id) empresas,COUNT(DISTINCT fecha_precio) fechas,MIN(fecha_precio) fecha_min,MAX(fecha_precio) fecha_max FROM valuation_input_snapshot'),
    markets: await read('markets', 'SELECT * FROM mercado LIMIT 20')
  };
  const firstIds = (await read('probe_report_ids', "SELECT id FROM informe_financiero WHERE tipo_periodo='ANUAL' AND fecha_fin_periodo>='2022-01-01' AND fecha_fin_periodo<'2027-01-01' ORDER BY id LIMIT 100")).map(r => r.id);
  const placeholders = firstIds.map(() => '?').join(',');
  const plan = await read('pcv_plan', `EXPLAIN SELECT id,informe_id,concepto_estandar_id,concepto,importe,nivel_confianza FROM partida_contable_valor WHERE informe_id IN (${placeholders}) AND concepto_estandar_id IN (1,3,4,5,9,10,12,13,14,15,16,17,18,19,20,22,23,24,25,26,34) ORDER BY informe_id,id LIMIT 10001`, firstIds);
  const pcv = await read('pcv_probe', `SELECT id,informe_id,concepto_estandar_id,concepto,importe,nivel_confianza FROM partida_contable_valor WHERE informe_id IN (${placeholders}) AND concepto_estandar_id IN (1,3,4,5,9,10,12,13,14,15,16,17,18,19,20,22,23,24,25,26,34) ORDER BY informe_id,id LIMIT 10001`, firstIds);
  save('contexto_y_referencias', { identity, reports, samples, reference, plan, probeRows: pcv.length });
  console.log(JSON.stringify({ stage: 'context', samples, reference, plan, probeRows: pcv.length, maxQueryMs: Math.max(...log.map(x => x.ms)) }, null, 2));
}
const AS_OF = '2026-10-29';
const SUCCESS = "'INSERTED','NULL_FILLED','VERIFIED_EXISTING'";
const METRICS = ['INGRESOS','EBITDA','EBIT','ACTIVOS_TOTALES','EFECTIVO','DEUDA_FINANCIERA','DEUDA_NETA','PATRIMONIO_NETO','CFO','CAPEX','FCF','COBERTURA_INTERESES','DEUDA_NETA_EBITDA','CURRENT_RATIO','QUICK_RATIO','CASH_RATIO'];
const balance = new Set(['EFECTIVO','ACTIVOS_TOTALES','PATRIMONIO_NETO','ACCIONES_EN_CIRCULACION','DEUDA_CORTO_PLAZO','DEUDA_LARGO_PLAZO','INVENTARIOS','CUENTAS_COBRAR','CUENTAS_PAGAR']);
function numeric(v) { return v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v)) ? Number(v) : null; }
function group(rows, key) { const m = new Map(); for (const r of rows) { if (!m.has(r[key])) m.set(r[key], []); m.get(r[key]).push(r); } return m; }
function derive(p, k = {}) {
  const result = {};
  const get = code => p[code]?.value ?? null;
  const put = (id, value, origin, deps) => { if (value !== null && Number.isFinite(value)) result[id] = { value, origin, deps }; };
  const direct = (id, code, positive = false) => { const v = get(code); if (v !== null && (!positive || v >= 0)) put(id, v, 'PCV', [code]); };
  direct('INGRESOS','INGRESOS',true); direct('EBIT','EBIT'); direct('ACTIVOS_TOTALES','ACTIVOS_TOTALES',true);
  direct('EFECTIVO','EFECTIVO',true); direct('PATRIMONIO_NETO','PATRIMONIO_NETO'); direct('CFO','FLUJO_CAJA_OPERATIVO'); direct('CAPEX','CAPEX');
  const eb = get('EBIT'), da = get('DEPRECIACION_AMORTIZACION'), cp = get('DEUDA_CORTO_PLAZO'), lp = get('DEUDA_LARGO_PLAZO'), cash = get('EFECTIVO');
  direct('EBITDA','EBITDA');
  if (!result.EBITDA && eb !== null && da !== null && da >= 0) put('EBITDA',eb+da,'DERIVADO',['EBIT','DEPRECIACION_AMORTIZACION']);
  if (!result.EBITDA && k.EBITDA?.unit === 'MONEDA') put('EBITDA',k.EBITDA.value,'KPI',['KPI:EBITDA']);
  if (cp !== null && lp !== null && cp >= 0 && lp >= 0) put('DEUDA_FINANCIERA',cp+lp,'DERIVADO',['DEUDA_CORTO_PLAZO','DEUDA_LARGO_PLAZO']);
  // No se sustituye deuda financiera por pasivos ni se convierte un componente ausente en cero.
  if (result.DEUDA_FINANCIERA && cash !== null && cash >= 0) put('DEUDA_NETA',result.DEUDA_FINANCIERA.value-cash,'DERIVADO',['DEUDA_CORTO_PLAZO','DEUDA_LARGO_PLAZO','EFECTIVO']);
  direct('FCF','FCF');
  const cfo = get('FLUJO_CAJA_OPERATIVO'), capex = get('CAPEX');
  if (!result.FCF && cfo !== null && capex !== null && capex >= 0) put('FCF',cfo-capex,'DERIVADO',['FLUJO_CAJA_OPERATIVO','CAPEX']);
  if (!result.FCF && k.FCF?.unit === 'MONEDA') put('FCF',k.FCF.value,'KPI',['KPI:FCF']);
  const interest = get('GASTO_INTERESES');
  if (eb !== null && interest !== null && interest !== 0) put('COBERTURA_INTERESES',eb/Math.abs(interest),'DERIVADO',['EBIT','GASTO_INTERESES']);
  if (result.DEUDA_NETA && result.EBITDA?.value > 0) put('DEUDA_NETA_EBITDA',result.DEUDA_NETA.value/result.EBITDA.value,'DERIVADO',[...result.DEUDA_NETA.deps,...result.EBITDA.deps]);
  return result;
}
async function financials() {
  const startedAtUtc = new Date().toISOString(), identity = await connect();
  const meta = JSON.parse(fs.readFileSync(path.join(out, 'metadatos.json')));
  const codes = new Map(meta.taxonomy.map(t => [t.id, t.concepto_estandar]));
  const companies = await read('companies', 'SELECT e.id,e.pais_id,e.sector_id,p.codigo_iso FROM empresa e LEFT JOIN pais p ON p.id=e.pais_id ORDER BY e.id LIMIT 20000');
  if (companies.length === 20000) throw new Error('Límite de empresas alcanzado: detener auditoría');
  const instrumentRows = await read('instruments_prices', 'SELECT i.id,i.empresa_id,i.mercado_id,i.moneda,i.isin,i.ticker,q.fecha,q.precio_cierre FROM instrumento i LEFT JOIN cotizacion_diaria q ON q.instrumento_id=i.id ORDER BY i.id LIMIT 20000');
  const classifications = await read('classification_metadata', 'SELECT id,empresa_id,sector_id,reference_date,status,confidence FROM classification_evidence WHERE reference_date<=? ORDER BY id LIMIT 15000', [AS_OF]);
  const latestClass = new Map(); classifications.forEach(r => { const old=latestClass.get(r.empresa_id); if(!old || r.reference_date>old.reference_date || r.reference_date===old.reference_date&&r.id>old.id) latestClass.set(r.empresa_id,r); });
  const mapping = require(path.join(root,'server/dist/src/valoracion/mapeoSectores.js')).MAPEO_SECTORES;
  const configs = fs.readdirSync(path.join(root,'valuation_engine/generator/sector_configs')).filter(f=>f.endsWith('.json')).map(f=>JSON.parse(fs.readFileSync(path.join(root,'valuation_engine/generator/sector_configs',f))));
  for (const co of companies) {
    const cl=latestClass.get(co.id); co.overlayAccepted=!!(cl?.status==='ACCEPTED'&&cl.confidence==='HIGH');
    co.effectiveSector=co.overlayAccepted&&cl.sector_id!==null?cl.sector_id:co.sector_id;
    const map=mapping[co.effectiveSector]; co.mappingStatus=map?.clasificacion??'SIN_MAPEO';
    co.family=map&&map.clasificacion!=='REVISAR'?configs.find(x=>x.code===map.plantilla)?.family??'INDETERMINADA':'INDETERMINADA';
  }
  const companyMap=new Map(companies.map(c=>[c.id,c]));
  const reports=[];
  let cursor=0;
  while(true) {
    const page=await read('report_page', "SELECT id,empresa_id,tipo_periodo,tipo_documento,fecha_fin_periodo,fecha_publicacion,fuente FROM informe_financiero WHERE id>? AND tipo_periodo='ANUAL' AND fecha_fin_periodo>='2022-01-01' AND fecha_fin_periodo<'2027-01-01' ORDER BY id LIMIT 2000",[cursor]);
    if(!page.length)break; reports.push(...page);cursor=page.at(-1).id;
  }
  const observed=[], vivStats={rowsRead:0,latestReports:0,reportDateMismatch:0,companyMismatch:0,currencies:{},confidence:{},storedPresence:{},nonnullByCountryYear:{}},
    detail={pcvRowsRead:0,kpiRowsRead:0,verificationGroupsRead:0,reportEvidenceRows:0,contextRowsFromVerification:0,conceptRecords:{},verificationOutcomes:{},ambiguousConcepts:{},negativeNonnegativeConcepts:{},rawCurrentTags:{},sourceByCountry:{},reportBasis:{},reportCurrency:{},missingContext:0,unsafeIntegerAmounts:0};
  const nonnegative=new Set(['INGRESOS','EFECTIVO','ACTIVOS_TOTALES','DEUDA_CORTO_PLAZO','DEUDA_LARGO_PLAZO','DEPRECIACION_AMORTIZACION']);
  const vivFields=['ingresos','ebitda','ebit','activos_totales','efectivo','deuda_corto_plazo','deuda_largo_plazo','deuda_total','deuda_neta','patrimonio_neto','flujo_caja_operativo','capex','fcf','cobertura_intereses','acciones_en_circulacion','gasto_intereses'];
  const latestVivShares=new Map();
  let offset=0,batchSize=100,lastProgress=0;
  while(offset<reports.length){
    const page=reports.slice(offset,offset+batchSize),ids=page.map(r=>r.id),ph=ids.map(()=>'?').join(',');
    const raw=await read('pcv_block',`SELECT id,informe_id,concepto_estandar_id,concepto,importe,nivel_confianza FROM partida_contable_valor WHERE informe_id IN (${ph}) ORDER BY informe_id,id LIMIT 15001`,ids);
    if(raw.length>=15001){if(batchSize===1)throw new Error('Bloque PCV de un informe supera límite: auditoría detenida, no truncar');batchSize=Math.max(1,Math.floor(batchSize/2));console.log(JSON.stringify({stage:'subdivide',offset,batchSize}));continue;}
    const kpi=await read('kpi_block',`SELECT informe_id,kpi,unidad,valor,nivel_confianza FROM kpi_financiero_informe WHERE informe_id IN (${ph}) AND kpi IN ('EBITDA','FCF','COBERTURA_INTERESES','DEUDA_TOTAL','DEUDA_NETA') LIMIT 1001`,ids);
    if(kpi.length>=1001)throw new Error('Bloque KPI supera límite');
    const viv=await read('viv_block',`SELECT id,empresa_id,informe_id,fecha_fin_periodo,moneda,nivel_confianza,${vivFields.join(',')} FROM valuation_input_version WHERE informe_id IN (${ph}) ORDER BY id LIMIT 5001`,ids);
    if(viv.length>=5001)throw new Error('Bloque VIV supera límite');
    const re=await read('report_context_block',`SELECT informe_id,provider,JSON_UNQUOTE(JSON_EXTRACT(evidence_json,'$.context.currency')) currency,JSON_UNQUOTE(JSON_EXTRACT(evidence_json,'$.context.basis')) basis,JSON_UNQUOTE(JSON_EXTRACT(evidence_json,'$.context.start')) start,JSON_UNQUOTE(JSON_EXTRACT(evidence_json,'$.context.identity.publicationVerified')) publicationVerified,JSON_UNQUOTE(JSON_EXTRACT(evidence_json,'$.context.identity.published')) published,JSON_UNQUOTE(JSON_EXTRACT(evidence_json,'$.policy')) policy FROM financial_report_evidence WHERE informe_id IN (${ph}) LIMIT 201`,ids);
    const ver=await read('verification_metadata_block',`SELECT informe_id,concept_code,outcome,COUNT(*) n,MAX(id) last_id FROM pcv_verification_evidence WHERE informe_id IN (${ph}) GROUP BY informe_id,concept_code,outcome LIMIT 10001`,ids);
    if(ver.length>=10001)throw new Error('Bloque verificación supera límite');
    const rawBy=group(raw,'informe_id'),kpiBy=group(kpi,'informe_id'),vivBy=group(viv,'informe_id'),reBy=new Map(re.map(r=>[r.informe_id,r])),verBy=group(ver,'informe_id');
    const contextNeeded=[];
    for(const r of page){if(reBy.has(r.id))continue;const good=(verBy.get(r.id)||[]).filter(v=>['INSERTED','NULL_FILLED','VERIFIED_EXISTING'].includes(v.outcome)).sort((a,b)=>b.last_id-a.last_id);if(good[0])contextNeeded.push(good[0].last_id);}
    if(contextNeeded.length){
      const p2=contextNeeded.map(()=>'?').join(',');
      const contexts=await read('single_verification_context_block',`SELECT informe_id,JSON_UNQUOTE(JSON_EXTRACT(evidence_json,'$.context.currency')) currency,JSON_UNQUOTE(JSON_EXTRACT(evidence_json,'$.context.basis')) basis,JSON_UNQUOTE(JSON_EXTRACT(evidence_json,'$.context.start')) start,JSON_UNQUOTE(JSON_EXTRACT(evidence_json,'$.context.identity.published')) published,JSON_UNQUOTE(JSON_EXTRACT(evidence_json,'$.policy')) policy FROM pcv_verification_evidence WHERE id IN (${p2}) LIMIT 100`,contextNeeded);
      contexts.forEach(r=>reBy.set(r.informe_id,{...r,contextFromVerification:true}));detail.contextRowsFromVerification+=contexts.length;
    }
    detail.pcvRowsRead+=raw.length;detail.kpiRowsRead+=kpi.length;detail.verificationGroupsRead+=ver.length;detail.reportEvidenceRows+=re.length;vivStats.rowsRead+=viv.length;
    for(const r of page){
      const co=companyMap.get(r.empresa_id),country=co?.codigo_iso??'SIN_PAIS',year=Number(r.fecha_fin_periodo.slice(0,4)),pv={},ks={},conflicts=[];
      for(const v of rawBy.get(r.id)||[]){
        const code=codes.get(v.concepto_estandar_id),value=numeric(v.importe);
        const tag=(v.concepto||'').split(':').at(-1);
        if(/^(AssetsCurrent|CurrentAssets|LiabilitiesCurrent|CurrentLiabilities|PrepaidExpensesCurrent|PrepaymentsCurrent)$/i.test(tag))detail.rawCurrentTags[tag]=(detail.rawCurrentTags[tag]||0)+1;
        if(!code)continue;
        const cs=detail.conceptRecords[code]??={rows:0,nonnull:0,zero:0,negative:0,confidence:{}};cs.rows++;if(value!==null){cs.nonnull++;if(value===0)cs.zero++;if(value<0)cs.negative++;if(Math.abs(value)>Number.MAX_SAFE_INTEGER)detail.unsafeIntegerAmounts++;}
        cs.confidence[v.nivel_confianza??'NULL']=(cs.confidence[v.nivel_confianza??'NULL']||0)+1;
        if(value!==null){if(!pv[code])pv[code]={value,ids:[v.id],confidence:v.nivel_confianza};else{pv[code].ids.push(v.id);if(pv[code].value!==value){pv[code].value=null;conflicts.push(code);}}}
        if(value!==null&&value<0&&nonnegative.has(code))detail.negativeNonnegativeConcepts[code]=(detail.negativeNonnegativeConcepts[code]||0)+1;
      }
      for(const code of new Set(conflicts))detail.ambiguousConcepts[code]=(detail.ambiguousConcepts[code]||0)+1;
      for(const k of kpiBy.get(r.id)||[])ks[k.kpi]={value:numeric(k.valor),unit:k.unidad};
      const metrics=derive(pv,ks),context=reBy.get(r.id),basis=context?.basis??'DESCONOCIDA',currency=context?.currency??'DESCONOCIDA';
      detail.reportBasis[country+':'+basis]=(detail.reportBasis[country+':'+basis]||0)+1;detail.reportCurrency[country+':'+currency]=(detail.reportCurrency[country+':'+currency]||0)+1;
      if(!context)detail.missingContext++;
      detail.sourceByCountry[country+':'+r.fuente]=(detail.sourceByCountry[country+':'+r.fuente]||0)+1;
      const eligible=!!r.fecha_publicacion&&r.fecha_publicacion>=r.fecha_fin_periodo&&r.fecha_publicacion<=AS_OF&&r.fecha_fin_periodo<=AS_OF;
      const days=context?.start?(Date.parse(r.fecha_fin_periodo)-Date.parse(context.start))/86400000+1:null;
      const contextIdentified=eligible&&['consolidated','standalone'].includes(basis)&&currency===({US:'USD',JP:'JPY',TW:'TWD'}[country])&&days>=350&&days<=381;
      const success=new Set();let bad=0;
      for(const v of verBy.get(r.id)||[]){detail.verificationOutcomes[v.outcome]=(detail.verificationOutcomes[v.outcome]||0)+Number(v.n);if(['INSERTED','NULL_FILLED','VERIFIED_EXISTING'].includes(v.outcome))success.add(v.concept_code);else if(/CONFLICT|REJECT|AMBIGUOUS|PRECISION/.test(v.outcome))bad+=Number(v.n);}
      const outMetrics={};for(const [id,m]of Object.entries(metrics))outMetrics[id]={origin:m.origin,attestationMetadata:contextIdentified&&m.deps.every(d=>success.has(d))};
      const versions=(vivBy.get(r.id)||[]).sort((a,b)=>b.id-a.id),latest=versions[0];
      if(latest){vivStats.latestReports++;if(latest.fecha_fin_periodo!==r.fecha_fin_periodo)vivStats.reportDateMismatch++;if(latest.empresa_id!==r.empresa_id)vivStats.companyMismatch++;
        vivStats.currencies[latest.moneda??'NULL']=(vivStats.currencies[latest.moneda??'NULL']||0)+1;vivStats.confidence[latest.nivel_confianza??'NULL']=(vivStats.confidence[latest.nivel_confianza??'NULL']||0)+1;
        for(const f of vivFields){if(numeric(latest[f])!==null){vivStats.storedPresence[f]=(vivStats.storedPresence[f]||0)+1;const key=country+':'+year+':'+f;vivStats.nonnullByCountryYear[key]=(vivStats.nonnullByCountryYear[key]||0)+1;}}
        if(numeric(latest.acciones_en_circulacion)>0){const old=latestVivShares.get(co.id);if(!old||r.fecha_fin_periodo>old.fecha)latestVivShares.set(co.id,{fecha:r.fecha_fin_periodo,fechaPublicacion:r.fecha_publicacion,dateMismatch:latest.fecha_fin_periodo!==r.fecha_fin_periodo,moneda:latest.moneda});}
      }
      const shares=pv.ACCIONES_EN_CIRCULACION?.value;
      observed.push({id:r.id,empresa_id:r.empresa_id,country,year,fin:r.fecha_fin_periodo,publicacion:r.fecha_publicacion,fuente:r.fuente,eligible,basis,currency,contextIdentified,contextOrigin:context?.contextFromVerification?'SINGLE_VERIFICATION':context?'REPORT_EVIDENCE':'NONE',
        metrics:outMetrics,conflicts:[...new Set(conflicts)],adverseVerificationEvents:bad,pcvRows:(rawBy.get(r.id)||[]).length,
        sharesPositive:typeof shares==='number'&&shares>0,sharesAttestation:success.has('ACCIONES_EN_CIRCULACION'),shareRecordIds:pv.ACCIONES_EN_CIRCULACION?.ids??[],viv:latest?{id:latest.id,dateMismatch:latest.fecha_fin_periodo!==r.fecha_fin_periodo,present:vivFields.filter(f=>numeric(latest[f])!==null)}:null});
    }
    offset+=page.length;
    if(offset-lastProgress>=1000){lastProgress=offset;console.log(JSON.stringify({stage:'financial',reports:offset,total:reports.length,pcvRows:detail.pcvRowsRead,batchSize}));}
    if(offset%5000===0)fs.writeFileSync(path.join(out,'checkpoint_financiero.json'),JSON.stringify({offset,total:reports.length,observed,detail,vivStats}));
    // Pausa corta entre bloques; sin concurrencia de consultas y sin retener snapshots largos.
    await new Promise(resolve=>setTimeout(resolve,40));
  }
  const endedAtUtc=new Date().toISOString();
  fs.writeFileSync(path.join(out,'observaciones_financieras.json'),JSON.stringify({startedAtUtc,endedAtUtc,asOf:AS_OF,identity,companies,instruments:instrumentRows,reports:observed,detail,vivStats,latestVivShares:Object.fromEntries(latestVivShares),
    caveat:'Lectura progresiva por bloques READ ONLY, no snapshot global atómico. attestationMetadata identifica evidencias disponibles, no coteja todos los JSON candidato/valor/registro ni certifica cada indicador.'}));
  console.log(JSON.stringify({stage:'financial_complete',reports:observed.length,pcvRows:detail.pcvRowsRead,vivStats:{...vivStats,nonnullByCountryYear:undefined},detail:{...detail,conceptRecords:undefined},maxQueryMs:Math.max(...log.map(x=>x.ms))},null,2));
}
async function finalChecks() {
  const identity=await connect(),s=JSON.parse(fs.readFileSync(path.join(out,'cobertura_resumen.json'))),result={identity};
  result.population=await read('final_population',"SELECT p.codigo_iso,COUNT(DISTINCT e.id) empresas,COUNT(DISTINCT i.id) instrumentos,COUNT(DISTINCT CASE WHEN f.id IS NOT NULL THEN e.id END) empresas_informes,COUNT(DISTINCT CASE WHEN f.tipo_periodo='ANUAL' THEN e.id END) empresas_anuales FROM empresa e LEFT JOIN pais p ON p.id=e.pais_id LEFT JOIN instrumento i ON i.empresa_id=e.id LEFT JOIN informe_financiero f ON f.empresa_id=e.id GROUP BY p.codigo_iso LIMIT 15");
  result.versionDateOffsets=await read('viv_date_offsets',"SELECT DATEDIFF(v.fecha_fin_periodo,f.fecha_fin_periodo) dias,COUNT(*) versiones,COUNT(DISTINCT v.informe_id) informes FROM valuation_input_version v JOIN informe_financiero f ON f.id=v.informe_id GROUP BY DATEDIFF(v.fecha_fin_periodo,f.fecha_fin_periodo) ORDER BY versiones DESC LIMIT 30");
  result.versionDateSamples=await read('viv_date_samples',"SELECT v.id version_id,v.informe_id,f.empresa_id,f.fecha_fin_periodo fecha_informe,v.fecha_fin_periodo fecha_version,f.tipo_periodo,v.tipo_periodo tipo_version,v.moneda FROM valuation_input_version v JOIN informe_financiero f ON f.id=v.informe_id WHERE v.fecha_fin_periodo<>f.fecha_fin_periodo ORDER BY v.id DESC LIMIT 8");
  result.kpiKinds=await read('actual_kpi_kinds','SELECT kpi,unidad,COUNT(*) filas,SUM(valor IS NOT NULL) no_null FROM kpi_financiero_informe GROUP BY kpi,unidad ORDER BY kpi LIMIT 150');
  result.triggers=await read('triggers_metadata','SELECT TRIGGER_NAME,EVENT_MANIPULATION,EVENT_OBJECT_TABLE,ACTION_TIMING FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA=DATABASE() LIMIT 50');
  result.events=await read('events_metadata','SELECT EVENT_NAME,STATUS,EVENT_TYPE FROM information_schema.EVENTS WHERE EVENT_SCHEMA=DATABASE() LIMIT 50');
  result.freezeSummary=await read('frozen_summary',"SELECT financial_state,engine_version,COUNT(*) runs,COUNT(DISTINCT instrumento_id) instrumentos,MIN(created_at) created_min,MAX(created_at) created_max FROM valuation_execution GROUP BY financial_state,engine_version LIMIT 30");
  const ids=s.sampleReportIds.TW.slice(0,5),ph=ids.map(()=>'?').join(',');
  result.twSourceSamples=await read('tw_source_samples',`SELECT f.id,f.empresa_id,e.nombre_empresa,f.fuente,f.tipo_documento,f.identificador_fuente,f.fecha_fin_periodo,f.fecha_publicacion FROM informe_financiero f JOIN empresa e ON e.id=f.empresa_id WHERE f.id IN (${ph}) LIMIT 5`,ids);
  result.twConceptSamples=await read('tw_concept_samples',`SELECT informe_id,concepto_estandar_id,concepto,importe FROM partida_contable_valor WHERE informe_id IN (${ph}) AND concepto_estandar_id IN (1,9,13) ORDER BY informe_id,id LIMIT 50`,ids);
  // Muestra deliberada, no aleatoria: no extrapolar tasas de validación a la población.
  const sample=[];
  for(const country of ['US','JP','TW']){
    const ids=s.sampleReportIds[country],ph=ids.map(()=>'?').join(',');if(!ids.length)continue;
    const pcv=await read('sample_pcv_'+country,`SELECT id,informe_id,concepto_estandar_id,concepto,importe FROM partida_contable_valor WHERE informe_id IN (${ph}) ORDER BY informe_id,id LIMIT 5001`,ids);
    if(pcv.length>=5001)throw new Error('Bloque de muestra excedido');
    const selected=await read('sample_success_ids_'+country,`SELECT informe_id,concept_code,MAX(id) id FROM pcv_verification_evidence WHERE informe_id IN (${ph}) AND outcome IN (${SUCCESS}) GROUP BY informe_id,concept_code LIMIT 1001`,ids);
    if(selected.length>=1001)throw new Error('Bloque de evidencia de muestra excedido');
    const vr=selected.map(x=>x.id),vp=vr.map(()=>'?').join(',');
    const evid=vr.length?await read('sample_candidate_fields_'+country,`SELECT id,informe_id,concept_code,outcome,JSON_EXTRACT(evidence_json,'$.evidence.record_id') record_id,JSON_EXTRACT(evidence_json,'$.evidence.record_ids') record_ids,JSON_EXTRACT(evidence_json,'$.evidence.candidate.importe') amount,JSON_UNQUOTE(JSON_EXTRACT(evidence_json,'$.evidence.candidate.currency')) currency,JSON_UNQUOTE(JSON_EXTRACT(evidence_json,'$.evidence.candidate.basis')) basis,JSON_UNQUOTE(JSON_EXTRACT(evidence_json,'$.evidence.candidate.evidence.start')) start,JSON_UNQUOTE(JSON_EXTRACT(evidence_json,'$.evidence.candidate.evidence.end')) end,JSON_UNQUOTE(JSON_EXTRACT(evidence_json,'$.context.currency')) ctx_currency,JSON_UNQUOTE(JSON_EXTRACT(evidence_json,'$.context.basis')) ctx_basis,JSON_UNQUOTE(JSON_EXTRACT(evidence_json,'$.context.start')) ctx_start FROM pcv_verification_evidence WHERE id IN (${vp}) LIMIT 1000`,vr):[];
    const re=await read('sample_publication_'+country,`SELECT informe_id,JSON_UNQUOTE(JSON_EXTRACT(evidence_json,'$.filing.filed')) sec_filed,JSON_UNQUOTE(JSON_EXTRACT(evidence_json,'$.source.published')) jp_published,JSON_UNQUOTE(JSON_EXTRACT(evidence_json,'$.context.identity.published')) context_published FROM financial_report_evidence WHERE informe_id IN (${ph}) LIMIT 20`,ids);
    const all=JSON.parse(fs.readFileSync(path.join(out,'observaciones_financieras.json'))),reports=new Map(all.reports.filter(r=>ids.includes(r.id)).map(r=>[r.id,r]));
    const metadata=JSON.parse(fs.readFileSync(path.join(out,'metadatos.json'))),codes=new Map(metadata.taxonomy.map(t=>[t.id,t.concepto_estandar]));
    const by=group(pcv,'informe_id'),evBy=group(evid,'informe_id'),pubBy=new Map(re.map(r=>[r.informe_id,r]));
    for(const id of ids){
      const report=reports.get(id),raw=by.get(id)||[],verified={},pv={},checks=[];
      for(const row of raw){const code=codes.get(row.concepto_estandar_id),v=numeric(row.importe);if(!code||v===null)continue;if(!pv[code])pv[code]={value:v,ids:[row.id]};else{pv[code].ids.push(row.id);if(pv[code].value!==v)pv[code].value=null;}}
      for(const ev of evBy.get(id)||[]){
        const rows=raw.filter(r=>codes.get(r.concepto_estandar_id)===ev.concept_code&&r.importe!==null),recordIds=ev.record_ids||[ev.record_id],amount=numeric(ev.amount);
        const valueMatch=rows.length>0&&amount!==null&&rows.every(r=>recordIds.includes(r.id)&&Math.abs(Number(r.importe)-amount)<=.000051);
        const unit=ev.concept_code==='ACCIONES_EN_CIRCULACION'?'shares':ev.concept_code==='EPS_DILUIDO'?ev.ctx_currency+'/shares':ev.ctx_currency;
        const periodMatch=ev.end===report.fin&&(balance.has(ev.concept_code)?!ev.start||ev.start==='null':ev.start===ev.ctx_start);
        const contextMatch=ev.ctx_currency===report.currency&&ev.ctx_basis===report.basis&&['consolidated','standalone'].includes(ev.ctx_basis)&&ev.basis===ev.ctx_basis&&ev.currency===unit;
        if(valueMatch&&periodMatch&&contextMatch)verified[ev.concept_code]=true;
        checks.push({code:ev.concept_code,valueMatch,periodMatch,contextMatch});
      }
      const publication=pubBy.get(id),publicationMatch=!!publication&&[publication.sec_filed,publication.jp_published,publication.context_published].includes(report.publicacion);
      const ms=derive(pv),validMetrics=Object.entries(ms).filter(([k,m])=>publicationMatch&&report.contextIdentified&&m.deps.every(c=>verified[c])).map(([k])=>k);
      sample.push({country,reportId:id,companyId:report.empresa_id,basis:report.basis,currency:report.currency,publicationMatch,validMetrics,checks});
    }
  }
  result.sample=sample;result.sampleSummary=Object.fromEntries(['US','JP','TW'].map(co=>{const rs=sample.filter(r=>r.country===co);return[co,{reports:rs.length,publicationMatched:rs.filter(r=>r.publicationMatch).length,metrics:Object.fromEntries(METRICS.map(m=>[m,rs.filter(r=>r.validMetrics.includes(m)).length]))}];}));
  result.finishedAtUtc=new Date().toISOString();save('comprobaciones_finales',result);
  console.log(JSON.stringify({...result,kpiKinds:undefined,sample:undefined},null,2));
}
async function extraChecks(){
  const identity=await connect();
  const frozenRisk=await read('frozen_market_variables',"SELECT COUNT(*) runs,SUM(JSON_CONTAINS_PATH(input_json,'one','$.risk_inputs.median_daily_dollar_volume_90d')) con_volumen_agregado,SUM(JSON_CONTAINS_PATH(input_json,'one','$.risk_inputs.free_float','$.free_float','$.bid','$.ask','$.daily_prices','$.quotes','$.prices')) con_campos_bursatiles_alternativos FROM valuation_execution");
  const refQuality=await read('reference_quality',"SELECT COUNT(*) filas,SUM(ke_referencia IS NULL) ke_null,SUM(equity_risk_premium IS NULL) erp_null FROM coste_capital_referencia");
  const result={identity,frozenRisk,refQuality,capturedAtUtc:new Date().toISOString()};save('complementos',result);console.log(JSON.stringify(result,null,2));
}
function integrity(){
  const before=JSON.parse(fs.readFileSync(path.join(out,'integridad_inicial.json'))).files,now=hashes();
  const differences=Object.entries(before).filter(([file,h])=>now[file]!==h).map(([file,h])=>({file,before:h,after:now[file]??null}));
  const protectedChanges=differences.filter(x=>!/^server\/docs\/.*\.md$/.test(x.file));
  const manifest=require(path.join(root,'valuation_engine/scripts/manifest.cjs')).current();
  const phase1Manifest=JSON.parse(fs.readFileSync(path.join(phase1,'evidencias/compatibilidad_inicial.json'))).engine.manifest;
  const result={comparedFiles:Object.keys(before).length,unchanged:Object.keys(before).length-differences.length,differences,protectedChanges,manifest,phase1Manifest,manifestMatches:JSON.stringify(manifest)===JSON.stringify(phase1Manifest),capturedAtUtc:new Date().toISOString()};
  save('integridad_final',result);console.log(JSON.stringify(result,null,2));
  if(protectedChanges.length||!result.manifestMatches)throw new Error('Límite de integridad: diferencias en archivos protegidos');
}
async function main() {
  const mode = process.argv[2] || '--metadatos';
  const baseline = path.join(out, 'integridad_inicial.json');
  if (!fs.existsSync(baseline)) save('integridad_inicial', { files: hashes() });
  if (mode === '--metadatos') await metadata();
  else if (mode === '--contexto') await contextProbe();
  else if (mode === '--financieros') await financials();
  else if (mode === '--final') await finalChecks();
  else if (mode === '--complementos') await extraChecks();
  else if (mode === '--integridad') integrity();
  else throw new Error('Modo no reconocido');
}
main().catch(e => { save('error_ultimo', { code: e.code || e.name, message: /^La sesión|Modo|SQL fuera|Bloque|Límite/.test(e.message) ? e.message : 'Error de consulta/conexión; consultar código y registro sin credenciales.' }); console.error(JSON.stringify({ error: e.code || e.name })); process.exitCode = 1; })
  .finally(async () => { if (c) await c.end(); save('consultas_' + (process.argv[2] || 'metadatos').replaceAll('-', ''), log); });
