// Auditoría local: no carga backend, dotenv, pools, importadores ni escritores.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const cp = require('node:child_process');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../../../..');
const here = path.resolve(__dirname, '..');
const hash = data => crypto.createHash('sha256').update(data).digest('hex');
function inventory() {
  const r = cp.spawnSync('git', ['-c', `safe.directory=${root.replaceAll('\\', '/')}`, '-C', root, 'ls-files', '-z'], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(r.stderr);
  return Object.fromEntries(r.stdout.split('\0').filter(Boolean)
    .filter(f => !f.startsWith('valuation_engine/research/coste_capital/'))
    .filter(f => fs.existsSync(path.join(root, f)) && fs.statSync(path.join(root, f)).isFile())
    .sort().map(f => [f, hash(fs.readFileSync(path.join(root, f)))]));
}
function engineState() {
  const engine = path.join(root, 'valuation_engine');
  const manifest = require(path.join(engine, 'scripts/manifest.cjs')).current();
  const input = JSON.parse(fs.readFileSync(path.join(engine, 'ejemplos/DEMO_NO_REAL.json'), 'utf8'));
  const result = require(path.join(engine, 'dist/src/modelo.js')).valorar(input, { root: engine });
  return { manifest, syntheticDcfOutputHash: hash(JSON.stringify(result)) };
}
const file = path.join(here, 'evidencias/compatibilidad_inicial.json');
if (process.argv[2] === '--capturar') {
  if (fs.existsSync(file)) throw new Error('La evidencia inicial ya existe: no sobrescribir');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify({ auditedOn: '2026-10-29', files: inventory(), engine: engineState() }, null, 2) + '\n');
  console.log('Evidencia inicial capturada, solo hashes de archivos y DCF sintético.');
} else {
  const before = JSON.parse(fs.readFileSync(file, 'utf8'));
  const now = inventory();
  const differences = Object.entries(before.files).filter(([f, h]) => now[f] !== h).map(([f, h]) => ({ file: f, before: h, after: now[f] ?? null }));
  // Los informes operativos ajenos ya estaban modificados al iniciar la tarea y pueden actualizarse concurrentemente.
  // Nunca se restablecen ni se recaptura la línea base para ocultar diferencias.
  const operationalReports = differences.filter(x => /^server\/docs\/.*\.md$/.test(x.file));
  const protectedChanges = differences.filter(x => !operationalReports.includes(x));
  const currentEngine = engineState();
  fs.writeFileSync(path.join(here, 'evidencias/compatibilidad_final.json'), JSON.stringify({
    auditedOn: '2026-10-29', filesCompared: Object.keys(before.files).length,
    differences, operationalReports, protectedChanges, engineBefore: before.engine, engineAfter: currentEngine
  }, null, 2) + '\n');
  assert.deepEqual(protectedChanges, [], 'Archivos protegidos originales alterados');
  assert.deepEqual(currentEngine, before.engine, 'Manifiesto o DCF original alterado');
  console.log(`OK: ${Object.keys(before.files).length - differences.length} archivos originales intactos; mismo manifiesto y resultado DCF sintético.`);
  if (operationalReports.length) console.log(`Diferencias documentales concurrentes conservadas, ajenas al módulo: ${operationalReports.map(x => x.file).join(', ')}`);
}
