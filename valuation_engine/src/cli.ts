import fs from 'node:fs';
import path from 'node:path';
import AdmZip from 'adm-zip';
import type { ModeloInput } from './tipos';
import { valorar } from './modelo';
import { escribirExcel } from './reportes/excel';
import { escribirPdf } from './reportes/pdf';

export function main(args:string[]=process.argv.slice(2)){
  const arg=(flag:string)=>{const i=args.indexOf(flag);return i<0?undefined:args[i+1]};
  const inp=arg('--input'),out=arg('--out');
  if(!inp||!out)throw new Error('Uso: npm.cmd run valuation -- --input ejemplos/DEMO_NO_REAL.json --out salida_demo');
  const root=path.resolve(__dirname,'../../');
  const data=JSON.parse(fs.readFileSync(path.resolve(inp),'utf8')) as ModeloInput;
  const r=valorar(data,{root});
  const base=`G2_${data.ticker.replace(/[^A-Za-z0-9_-]/g,'_')}_${data.valuation_date}_${String(data.valuation_run_id).replace(/[^A-Za-z0-9_-]/g,'_')}`;
  const dir=path.resolve(out);
  fs.mkdirSync(dir,{recursive:true});
  const xlsx=path.join(dir,base+'.xlsx'),pdf=path.join(dir,base+'.pdf'),json=path.join(dir,base+'.json'),zipname=path.join(dir,base+'.zip');
  const files=[xlsx,pdf,json,zipname];
  for(const f of files)if(fs.existsSync(f))throw new Error(`Archivo ya existe; no sobrescribir: ${f}`);
  escribirExcel(data,r,xlsx,root);
  escribirPdf(r,pdf);
  fs.writeFileSync(json,JSON.stringify(r,null,2)+'\n','utf8');
  const zip=new AdmZip();
  for(const f of [xlsx,pdf,json])zip.addLocalFile(f);
  zip.writeZip(zipname);
  console.log('G2EXCHANGE v1.5 TypeScript: SIN escrituras MySQL.');
  console.log('ESTADO:',r.validation_status,'| política de primas:',r.premium_methodology);
  for(const f of files)console.log(f);
}
if(require.main===module){try{main();}catch(err){console.error('ERROR:',err);process.exitCode=1;}}
