const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'../..'),compiledRoot='server/dist-capital';
const hash=x=>crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
function walk(dir){return fs.readdirSync(path.join(root,dir),{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(dir+'/'+e.name):[dir+'/'+e.name]);}
function sources(){const folders=['server/src/capital','server/src/pcv','valuation_engine/research/coste_capital/src'];
 const files=[...folders.flatMap(d=>walk(d).filter(n=>n.endsWith('.ts'))),...walk('valuation_engine/generator/sector_configs').filter(n=>n.endsWith('.json')),
 'server/src/valoracion/mapeoSectores.ts','server/src/valoracion/rutas.ts','server/insercionDatos/insercionPartidaContable.ts',
 'server/scripts/capital-manifest.cjs','server/scripts/capital-build.cjs','server/package-lock.json','server/package.json','server/tsconfig.json','server/tsconfig.capital.json','valuation_engine/package.json'];
 return Object.fromEntries(files.filter(f=>fs.existsSync(path.join(root,f))).sort().map(f=>[f,fs.readFileSync(path.join(root,f),'utf8')]));}
function compiled(){return Object.fromEntries(walk(compiledRoot).filter(f=>f.endsWith('.js')).sort().map(f=>[f,fs.readFileSync(path.join(root,f),'utf8')]));}
function inspect(){const source=sources(),js=compiled();return {version:'2.0.0-capital',sourceHash:hash(source),compiledHash:hash(js),source,js};}
module.exports={root,hash,sources,compiled,inspect};
