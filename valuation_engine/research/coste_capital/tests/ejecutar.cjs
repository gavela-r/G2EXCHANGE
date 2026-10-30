// Ejecutar desde cualquier cwd; solo compila este módulo. Sin npm install/build del motor.
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const here = path.resolve(__dirname, '..');
const compiler = path.resolve(here, '../../node_modules/typescript/bin/tsc');
let log = 'G2EXCHANGE — módulo interno coste capital — pruebas locales 29/10/2026\n';
function run(label, args) {
  const r = cp.spawnSync(process.execPath, args, { cwd: here, encoding: 'utf8', env: { ...process.env, NO_COLOR: '1' } });
  log += `\n${label}\n${r.stdout ?? ''}${r.stderr ?? ''}`;
  process.stdout.write(`${label}\n${r.stdout ?? ''}${r.stderr ?? ''}`);
  if (r.status !== 0) {
    fs.writeFileSync(path.join(here, 'evidencias/pruebas_modulo.txt'), log);
    throw new Error(`Falló ${label}`);
  }
}
run('TypeScript aislado', [compiler, '-p', path.join(here, 'tsconfig.json')]);
run('Pruebas A–H y validaciones', ['--test', path.join(here, 'dist/tests/modulo.test.js')]);
run('Compatibilidad de archivos/manifiesto/DCF sintético', [path.join(here, 'tests/compatibilidad.cjs')]);
fs.writeFileSync(path.join(here, 'evidencias/pruebas_modulo.txt'), log);
