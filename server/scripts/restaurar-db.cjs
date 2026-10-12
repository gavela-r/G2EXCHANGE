// Recovery always targets a NEW isolated database, never DB_NAME.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{spawnSync}=require('node:child_process');
require('dotenv').config({path:path.resolve(__dirname,'../../.env')});
const file=path.resolve(process.argv[2]||''),target=process.argv[3],container=process.env.G2_MYSQL_CONTAINER||'mysql_valoracion';
if(!/^g2_recovery_[A-Za-z0-9_]+$/.test(target||'')||target===process.env.DB_NAME)throw new Error('Destino nuevo g2_recovery_... obligatorio; producción prohibida');
const digest=crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
if(digest!==fs.readFileSync(file+'.sha256','utf8').trim())throw new Error('Hash del backup incorrecto');
function run(args){const r=spawnSync('docker',args,{encoding:'utf8'});if(r.status!==0)throw new Error(r.stderr||'Docker falló');}
run(['cp',file,container+':/tmp/g2-recovery-verified.sql']);
// CREATE DATABASE without IF NOT EXISTS deliberately refuses an existing target.
run(['exec',container,'sh','-c',`export MYSQL_PWD="$MYSQL_ROOT_PASSWORD"; mysql -uroot -e 'CREATE DATABASE ${target}' && mysql -uroot ${target} < /tmp/g2-recovery-verified.sql`]);
console.log('Backup restaurado en '+target+'; cambiar DB_NAME solo tras verificar datos.');
