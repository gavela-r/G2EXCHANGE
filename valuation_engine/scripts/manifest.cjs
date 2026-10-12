const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..');
const hash=x=>crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
function files(dir,ext,base=root){return fs.readdirSync(path.join(base,dir),{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(dir+'/'+e.name,ext,base):e.name.endsWith(ext)?[dir+'/'+e.name]:[]).sort();}
function current(base=root){const list=[...files('src','.ts',base),...files('config','.json',base),...files('generator/sector_configs','.json',base)].sort();return {version:JSON.parse(fs.readFileSync(path.join(base,'package.json'))).version,sourceHash:hash(list.map(f=>[f,fs.readFileSync(path.join(base,f),'utf8')])),compiledHash:hash(files('dist/src','.js',base).map(f=>[f,fs.readFileSync(path.join(base,f),'utf8')]))};}
function archiveId(manifest){return hash(Object.fromEntries(Object.keys(manifest).sort().map(k=>[k,manifest[k]])));}
module.exports={current,archiveId};
if(require.main===module){
 const manifest=current();fs.writeFileSync(path.join(root,'dist/build-manifest.json'),JSON.stringify(manifest,null,2)+'\n');
 const target=path.join(root,'archives',archiveId(manifest));
 if(fs.existsSync(target)){if(JSON.stringify(current(target))!==JSON.stringify(manifest))throw new Error('Archivo histórico modificado: no sobrescribir');}
 else{
  const stage=target+'.tmp-'+process.pid;fs.mkdirSync(stage,{recursive:true});
  for(const entry of ['src','config','generator/sector_configs','dist/src','dist/config','package.json','dist/build-manifest.json'])if(fs.existsSync(path.join(root,entry)))fs.cpSync(path.join(root,entry),path.join(stage,entry),{recursive:true});
  if(JSON.stringify(current(stage))!==JSON.stringify(manifest))throw new Error('Archivo histórico incompleto');
  fs.renameSync(stage,target);
 }
}
