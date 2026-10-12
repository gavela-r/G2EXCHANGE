// Reads the full staged contents, reporting paths only, never secret values.
const {execFileSync}=require('node:child_process'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../..'),env=fs.existsSync(path.join(root,'.env'))?fs.readFileSync(path.join(root,'.env'),'utf8'):'';
const secrets=env.split(/\r?\n/).map(line=>line.match(/^([A-Z0-9_]*(?:TOKEN|KEY|PASSWORD|SECRET)[A-Z0-9_]*)=(.+)$/)).filter(Boolean).map(m=>m[2]).filter(s=>s.length>=8);
const names=execFileSync('git',['ls-files','-z'],{cwd:root}).toString().split('\0').filter(Boolean);const findings=[];let bytes=0;
for(const name of names){
 if(/(^|\/)(node_modules|private_backups|resultados_valoraciones|\.git|dist|archives)(\/|$)|(^|\/)\.env(?:$|\.(?!example$))|BACKUP|\.bak$|\.sql\.gz$|valoraciones_.*\.json$/.test(name)){findings.push({file:name,reason:'private/generated path'});continue;}
 const content=execFileSync('git',['show',':'+name],{cwd:root,maxBuffer:20*1024*1024});bytes+=content.length;let text=content.toString('utf8');
 if(name.endsWith('.xlsx')){
  const Zip=require('adm-zip'),X=require('xlsx');text=new Zip(content).getEntries().map(e=>e.isDirectory?'':e.getData().toString('utf8')).join('\n');
  const wb=X.read(content,{type:'buffer'}),rows=X.utils.sheet_to_json(wb.Sheets['02_DATOS_RAW'],{header:1});
  if(rows.slice(3).some(row=>row.slice(1,5).some(v=>v!==null&&v!==undefined&&v!=='')))findings.push({file:name,reason:'template contains historical input values'});
 }
 if(secrets.some(s=>text.includes(s))||/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|ghp_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,}|eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/.test(text))findings.push({file:name,reason:'secret detected'});
 if(/(?:password|apiKey|api_key)\s*[:=]\s*['"][a-zA-Z0-9_-]{12,}['"]/.test(text)&&!name.startsWith('server/tests/'))findings.push({file:name,reason:'embedded credential candidate'});
}
console.log(JSON.stringify({files_reviewed:names.length,bytes_read:bytes,findings},null,2));if(findings.length)process.exitCode=1;
