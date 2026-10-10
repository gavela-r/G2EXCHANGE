/** Validador/copiad or de plantillas. Las 16 plantillas están incluidas; no usa Python. */
import fs from 'node:fs';
import path from 'node:path';
import * as XLSX from 'xlsx';
const root=path.resolve(__dirname,'../../');
const files=fs.readdirSync(path.join(root,'generator/sector_configs')).filter(x=>x.endsWith('.json'));
if(files.length!==16)throw new Error(`Configuración: esperadas 16, encontradas ${files.length}`);
const outarg=process.argv.indexOf('--out');
const out=outarg>=0?path.resolve(process.argv[outarg+1]):null;
for(const file of files){
  const cfg=JSON.parse(fs.readFileSync(path.join(root,'generator/sector_configs',file),'utf8'));
  const targets=fs.readdirSync(path.join(root,'templates')).filter(x=>x.startsWith(`Template_${cfg.code}_`)&&x.endsWith('.xlsx'));
  if(targets.length!==1)throw new Error(`${cfg.code}: faltante o repetida`);
  const src=path.join(root,'templates',targets[0]);
  const wb=XLSX.readFile(src,{bookSheets:true});
  for(const s of ['01_CONTROL','02_DATOS_RAW','07_WACC','10_RESULTADO','11_OUTPUT_API'])
    if(!wb.SheetNames.includes(s))throw new Error(`${cfg.code}: falta ${s}`);
  if(out){fs.mkdirSync(out,{recursive:true});fs.copyFileSync(src,path.join(out,targets[0]));}
  console.log(`${cfg.code} ${cfg.slug}: plantilla OK`);
}
console.log('16 plantillas validadas. Copia literal sin regeneración destructiva.');
