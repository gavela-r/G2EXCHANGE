// Manifiesto de entrega: inventario de los archivos versionados en HEAD con su SHA-256, el commit, y las dependencias
// declaradas en cada package.json. Sólo lee el repositorio (git ls-files). Uso: npm run handoff:manifest [salida.json]
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{execSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),out=path.resolve(root,process.argv[2]??'ENTREGA_MANIFIESTO.json');
const git=a=>execSync('git '+a,{cwd:root,maxBuffer:1<<28}).toString().trim();
const archivos=git('ls-files -z').split('\0').filter(Boolean).filter(f=>f!==path.relative(root,out)).sort();
const entradas=archivos.map(f=>{const b=fs.readFileSync(path.join(root,f));return{archivo:f,bytes:b.length,sha256:crypto.createHash('sha256').update(b).digest('hex')};});
const paquetes=archivos.filter(f=>/(^|\/)package\.json$/.test(f)).map(f=>{const p=JSON.parse(fs.readFileSync(path.join(root,f),'utf8'));return{paquete:f,engines:p.engines??null,dependencies:p.dependencies??{},devDependencies:p.devDependencies??{}};});
const manifiesto={generado:new Date().toISOString(),rama:git('rev-parse --abbrev-ref HEAD'),commit:git('rev-parse HEAD'),archivos:entradas.length,bytes:entradas.reduce((a,x)=>a+x.bytes,0),sha256DelInventario:crypto.createHash('sha256').update(entradas.map(e=>e.sha256+'  '+e.archivo).join('\n')).digest('hex'),paquetes,inventario:entradas};
fs.writeFileSync(out,JSON.stringify(manifiesto,null,1));console.log(JSON.stringify({salida:out,commit:manifiesto.commit,archivos:manifiesto.archivos,sha256DelInventario:manifiesto.sha256DelInventario}));
