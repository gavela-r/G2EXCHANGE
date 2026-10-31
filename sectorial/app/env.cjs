// Resolución de rutas sin dependencias de una máquina concreta.
// En el repositorio: <repo>/sectorial/app → proyecto = <repo>. En el entorno aislado original: ../../G2EXCHANGE.
// Ambas pueden sobrescribirse con G2_PROJECT_ROOT y G2_SECTORIAL_AUDIT_ROOT.
const fs=require('node:fs'),path=require('node:path');
const repo=path.resolve(__dirname,'../..'),project=process.env.G2_PROJECT_ROOT??(fs.existsSync(path.join(repo,'server/package.json'))?repo:path.resolve(__dirname,'../../G2EXCHANGE'));
process.env.G2_PROJECT_ROOT??=project;process.env.G2_SECTORIAL_AUDIT_ROOT??=path.resolve(__dirname,'..');
module.exports={project,audit:process.env.G2_SECTORIAL_AUDIT_ROOT};
