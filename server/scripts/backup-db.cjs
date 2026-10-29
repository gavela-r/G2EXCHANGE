const {spawnSync}=require('node:child_process'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
require('dotenv').config({path:path.resolve(__dirname,'../../.env')});
const root=path.resolve(__dirname,'../..'),container=process.env.G2_MYSQL_CONTAINER||'mysql_valoracion',database=process.env.DB_NAME;
if(!/^[A-Za-z0-9_]+$/.test(database||'')||!/^[A-Za-z0-9_-]+$/.test(container))throw new Error('Nombre database/container inválido');
const schema=process.argv.includes('--schema'),stamp=new Date().toISOString().replace(/[:.]/g,'-');
const target=schema?path.join(root,'server/sql/00_schema.sql'):path.join(root,'private_backups','g2-'+stamp+'.sql');
fs.mkdirSync(path.dirname(target),{recursive:true});
function run(args){const r=spawnSync('docker',args,{encoding:'utf8'});if(r.status!==0)throw new Error(r.stderr||'Docker falló');}
const remote='/tmp/g2-export-'+(schema?'schema':'private')+'.sql';
run(['exec',container,'sh','-c',`umask 077; MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mysqldump -uroot --single-transaction --routines --triggers --events --hex-blob --no-tablespaces --set-gtid-purged=OFF ${schema?'--no-data --skip-comments --skip-add-drop-table ':''}--result-file=${remote} ${database}`]);
run(['cp',container+':'+remote,target]);
if(schema){let ddl=fs.readFileSync(target,'utf8').replace(/ AUTO_INCREMENT=\d+/g,'').replace(/DEFINER=`[^`]+`@`[^`]+`/g,'');fs.writeFileSync(target,'-- Schema only: no production data. MySQL 8. Restore into an EMPTY database.\n'+ddl);}
(async()=>{const sha256=await require('./pcv-file-hash.cjs').sha256File(target);fs.writeFileSync(target+'.sha256',sha256+'\n');console.log(JSON.stringify({file:target,bytes:fs.statSync(target).size,sha256,schema_only:schema}));

})().catch(e=>{console.error(e.message);process.exitCode=1;});
