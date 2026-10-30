const fs = require('node:fs');
const path = require('node:path');
const here = path.resolve(__dirname, '..');
const dest = 'docs/08_ARCHIVOS.md';
function walk(dir = '') {
  return fs.readdirSync(path.join(here, dir), { withFileTypes: true }).flatMap(e => {
    const rel = (dir ? dir + '/' : '') + e.name;
    return e.isDirectory() ? walk(rel) : [rel];
  });
}
const files = [...new Set([...walk(), dest])].sort();
let text = '# Relación exacta de archivos de esta intervención\n\n';
text += 'Todos los archivos nuevos mantenidos están bajo `valuation_engine/research/coste_capital/`. No se ha editado ningún archivo fuente preexistente. Los cambios anteriores/concurrentes de informes operativos no pertenecen a este módulo y se documentan en 07_PRUEBAS_Y_ESTADO.\n\n';
text += '## Nuevos archivos de código, pruebas, configuración, documentación y evidencias\n\n';
for (const f of files.filter(f => !f.startsWith('dist/'))) text += `- \`${f}\`\n`;
text += '\n## Compilados generados solo dentro del módulo (ignorados por Git)\n\n';
for (const f of files.filter(f => f.startsWith('dist/'))) text += `- \`${f}\`\n`;
text += '\n## Otros artefactos de prueba\n\n';
text += '- `server/resultados_valoraciones/verificacion/escala.json`: reporte sintético generado por una prueba backend existente, ignorado por Git. No es un resultado de valoración real.\n';
text += '- Las pruebas existentes de Excel/PDF usan archivos temporales que eliminan al terminar.\n';
text += '\nNo se han añadido dependencias ni modificado package.json, locks, SQL, frontend, plantillas, recuperadores, programaciones, fórmulas, archivos de motor histórico o interfaces públicas. No se han realizado commits ni migraciones.\n';
fs.writeFileSync(path.join(here, dest), text);
console.log(`Inventario: ${files.filter(f => !f.startsWith('dist/')).length} archivos nuevos mantenidos y ${files.filter(f => f.startsWith('dist/')).length} compilados aislados.`);
