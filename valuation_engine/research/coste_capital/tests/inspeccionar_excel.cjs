// Lectura de fórmulas, sin recalcular ni exportar libros.
const fs = require('node:fs');
const path = require('node:path');
const XLSX = require('../../../node_modules/xlsx');
const root = path.resolve(__dirname, '../../..');
const books = fs.readdirSync(path.join(root, 'templates')).filter(f => f.endsWith('.xlsx'));
const result = books.map(file => {
  const b = XLSX.readFile(path.join(root, 'templates', file), { cellFormula: true });
  const ws = b.Sheets['07_WACC'];
  return { file, sheets: b.SheetNames, wacc: Object.fromEntries(Object.entries(ws).filter(([a]) => !a.startsWith('!')).map(([a, c]) => [a, { value: c.v, formula: c.f }])) };
});
const out = path.resolve(__dirname, '../evidencias/plantillas_inspeccion.json');
fs.writeFileSync(out, JSON.stringify(result, null, 2) + '\n');
console.log(`Leídos ${result.length} maestros; fórmulas conservadas en ${out}`);
