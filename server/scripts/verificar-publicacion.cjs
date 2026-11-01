// Read-only publication check. Prints filenames/categories, never secret values.
const fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process'),root=path.resolve(__dirname,'../..');
const run=args=>execFileSync('git',args,{cwd:root,encoding:'utf8',maxBuffer:100*1024*1024,windowsHide:true});
const envFile=path.join(root,'.env'),env=fs.existsSync(envFile)?require('dotenv').parse(fs.readFileSync(envFile)):{};
const secrets=Object.entries(env).filter(([k,v])=>/(?:KEY|TOKEN|PASSWORD|SECRET)(?:_\d+)?$/i.test(k)&&v.length>=8&&!/^(SYNTHETIC|REPLACE|YOUR_|CHANGE)/i.test(v)).map(([,v])=>v);
const findings=[],seen=new Set(),patterns=[/fde_[A-Za-z0-9]{24,}/,/gh[pousr]_[A-Za-z0-9]{20,}/,/github_pat_[A-Za-z0-9_]{30,}/,/AKIA[A-Z0-9]{16}/,/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/];
function scan(content,file){if(secrets.some(s=>content.includes(s)))findings.push({file,category:'LOCAL_SECRET_VALUE'});if(patterns.some(p=>p.test(content)))findings.push({file,category:'CREDENTIAL_PATTERN'});}
for(const file of run(['ls-files','--cached','--others','--exclude-standard','-z']).split('\0').filter(Boolean)){if(/(^|\/)(?:private_backups|node_modules|\.verification|archives|resultados_valoraciones)(\/|$)|(^|\/)\.env(?:\..*)?$/.test(file)&&!file.endsWith('.env.example'))findings.push({file,category:'PRIVATE_FILE'});const absolute=path.join(root,file);if(fs.existsSync(absolute)&&fs.statSync(absolute).isFile())scan(fs.readFileSync(absolute).toString('utf8'),file);seen.add(file);}
if(process.argv.includes('--history'))for(const line of run(['rev-list','--objects','HEAD']).trim().split('\n')){const space=line.indexOf(' ');if(space<0)continue;const oid=line.slice(0,space),file=line.slice(space+1);if(run(['cat-file','-t',oid]).trim()==='blob')scan(run(['cat-file','blob',oid]),'history:'+file);}
console.log(JSON.stringify({files:seen.size,history:process.argv.includes('--history'),findings}));if(findings.length)process.exitCode=1;
