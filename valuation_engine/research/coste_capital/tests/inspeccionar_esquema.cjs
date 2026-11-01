// Solo lectura del DDL versionado, no conexión MySQL.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../../../..');
const ddl = fs.readFileSync(path.join(root, 'server/sql/00_schema.sql'), 'utf8');
const wanted = new Set(['empresa', 'sector', 'pais', 'instrumento', 'mercado', 'cotizacion_diaria', 'informe_financiero', 'partida_contable_valor',
  'taxonomia_concepto', 'valuation_input_version', 'valuation_input_snapshot', 'valuation_input_snapshot_detalle', 'valuation_run',
  'valuation_run_parametros', 'valuation_run_resultado', 'coste_capital_referencia', 'rating_sintetico', 'model_version', 'valuation_execution',
  'kpi_financiero_informe', 'financial_report_evidence', 'pcv_import_evidence', 'pcv_verification_evidence', 'classification_evidence', 'evento_corporativo']);
let out = '# Diccionario estructural extraído del DDL\n\nFuente: `server/sql/00_schema.sql`. No representa una consulta a la instancia desplegada. Nombres y tipos conservados, incluidas erratas históricas.\n\n';
let count = 0;
for (const m of ddl.matchAll(/CREATE TABLE `([^`]+)` \(([\s\S]*?)\) ENGINE=/g)) {
  if (!wanted.has(m[1])) continue;
  count++;
  out += `## ${m[1]}\n\n| Columna | Definición SQL |\n|---|---|\n`;
  for (const line of m[2].split('\n')) {
    const c = line.match(/^\s*`([^`]+)` (.*?)(,)?\r?$/);
    if (c) out += `| ${c[1]} | ${c[2].replaceAll('|', '\\|').replace(/,\s*$/, '')} |\n`;
  }
  out += '\nClaves y relaciones:\n\n```sql\n' + m[2].split('\n').filter(l => /PRIMARY KEY|UNIQUE KEY|FOREIGN KEY|CONSTRAINT.*CHECK/.test(l)).join('\n') + '\n```\n\n';
}
if (count !== wanted.size) throw new Error('Faltan tablas esperadas');
fs.writeFileSync(path.resolve(__dirname, '../docs/02_DICCIONARIO_SQL.md'), out);
console.log(`Extraídas ${count} tablas del DDL, sin ejecutar SQL.`);
