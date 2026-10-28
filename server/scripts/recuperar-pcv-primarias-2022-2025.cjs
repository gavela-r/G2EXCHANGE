// Compatibility entrypoint for Copilot's primary recovery. The original was
// preserved privately. Delegate to the verified missing-only/provenance worker.
const path=require('node:path'),{spawnSync}=require('node:child_process');
const args=process.argv.slice(2),ci=args.indexOf('--country');
const countries=ci>=0?[args[ci+1]]:['US','JP'];
if(countries.some(c=>!['US','JP'].includes(c)))throw new Error('--country US|JP');
const forwarded=args.filter((_,i)=>ci<0||i!==ci&&i!==ci+1);
for(const country of countries){
 const explicitDirectory=forwarded.includes('--directory');
 if(explicitDirectory&&countries.length>1)throw new Error('Un directorio por país; indicar --country');
 const directory=path.resolve(__dirname,'../../private_backups/pcv-compat-primary-'+country);
 const r=spawnSync(process.execPath,[path.join(__dirname,'recuperar-pcv-proveedores.cjs'),'--country',country,'--primary-only',...forwarded,...(explicitDirectory?[]:['--directory',directory])],{stdio:'inherit',windowsHide:true});
 if(r.status!==0){process.exitCode=r.status||1;break;}
}
