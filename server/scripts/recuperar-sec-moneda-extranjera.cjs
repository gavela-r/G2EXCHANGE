// Recupera, con el recuperador SEC verificado sin cambios de política (recuperar-sec-verificado.cjs), las empresas que
// antes quedaban bloqueadas por SEC_MONEDA_NO_SOPORTADA_* (emisores extranjeros 20-F/40-F que presentan en su moneda).
// Una ejecución por empresa, cada una con su directorio de checkpoint; usa los archivos SEC bulk ya descargados (sin
// red). La base de destino es la del entorno (DB_*): primero la copia aislada, después la operativa.
// Uso: node scripts/recuperar-sec-moneda-extranjera.cjs --ids ids.txt --directory private_backups/sec-moneda-<base>
//        --source-directory <pcv-us-bulk> [--write]
const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const arg=k=>{const i=process.argv.indexOf(k);return i>=0?process.argv[i+1]:null;};
const ids=fs.readFileSync(arg('--ids'),'utf8').split(/\s+/).map(Number).filter(n=>Number.isSafeInteger(n)&&n>0);
const base=path.resolve(arg('--directory')),source=path.resolve(arg('--source-directory')),write=process.argv.includes('--write');
fs.mkdirSync(base,{recursive:true});const resumen={empresas:ids.length,ok:0,fallos:0,porCodigo:{}};
for(const id of ids){
 const dir=path.join(base,String(id));if(fs.existsSync(path.join(dir,'checkpoint.json'))&&JSON.parse(fs.readFileSync(path.join(dir,'checkpoint.json'),'utf8')).done){resumen.ok++;continue;}
 const r=spawnSync(process.execPath,[path.join(__dirname,'recuperar-sec-verificado.cjs'),'--company-id',String(id),'--directory',dir,'--source-directory',source,...(fs.existsSync(path.join(dir,'checkpoint.json'))?['--resume']:[]),...(write?['--write']:[])],{encoding:'utf8',windowsHide:true,env:process.env});
 if(r.status===0)resumen.ok++;else{resumen.fallos++;const code=(r.stderr||'').trim().split('\n').pop().slice(0,80);resumen.porCodigo[code]=(resumen.porCodigo[code]??0)+1;}
 // Resultado por año desde el journal de la empresa.
 try{for(const l of fs.readFileSync(path.join(dir,'journal.jsonl'),'utf8').split('\n')){if(!l.trim())continue;const j=JSON.parse(l);const k=(j.status||'?')+'|'+(j.code||'');resumen.porCodigo[k]=(resumen.porCodigo[k]??0)+1;}}catch{}
}
fs.writeFileSync(path.join(base,'resumen.json'),JSON.stringify(resumen,null,2));console.log(JSON.stringify(resumen));
