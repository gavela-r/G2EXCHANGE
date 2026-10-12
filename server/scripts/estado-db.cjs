const path=require('node:path'),fs=require('node:fs');
require('dotenv').config({path:path.resolve(__dirname,'../../.env')});
const mysql=require('mysql2/promise');
(async()=>{
 const c=await mysql.createConnection({host:process.env.DB_HOST||'localhost',port:Number(process.env.DB_PORT||3307),user:process.env.DB_USER,password:process.env.DB_PASSWORD,database:process.argv[2]||process.env.DB_NAME,dateStrings:true});
 try{
 const report={database:(await c.query('SELECT DATABASE() name'))[0][0].name,counts:{},tables:[],columns:{}};
 const [tables]=await c.query('SHOW TABLES');report.tables=tables.map(r=>Object.values(r)[0]);
 for(const t of ['empresa','instrumento','valuation_input_version','valuation_input_snapshot','valuation_run','valuation_run_resultado','model_version','valuation_execution'])if(report.tables.includes(t))report.counts[t]=(await c.query('SELECT COUNT(*) n FROM `'+t+'`'))[0][0].n;
 for(const t of ['empresa','informe_financiero','instrumento','rating_sintetico','sector'])report.columns[t]=(await c.query('SHOW COLUMNS FROM `'+t+'`'))[0].map(r=>({name:r.Field,type:r.Type}));
 report.foreign_keys=(await c.query("SELECT TABLE_NAME,COLUMN_NAME,REFERENCED_TABLE_NAME,REFERENCED_COLUMN_NAME FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA=DATABASE() AND REFERENCED_TABLE_NAME IS NOT NULL"))[0];
 report.models=(await c.query('SELECT * FROM model_version'))[0];
 report.classification=(await c.query('SELECT s.id,s.nombre_sector,COUNT(*) empresas FROM empresa e JOIN sector s ON s.id=e.sector_id GROUP BY s.id ORDER BY empresas DESC'))[0];
 report.date_discrepancies=(await c.query('SELECT DATEDIFF(v.fecha_fin_periodo,i.fecha_fin_periodo) desplazamiento,COUNT(*) n FROM valuation_input_version v JOIN informe_financiero i ON i.id=v.informe_id GROUP BY desplazamiento'))[0];
 const dir=path.resolve(__dirname,'../../private_backups');fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,'estado-'+report.database+'-'+Date.now()+'.json'),JSON.stringify(report,null,2));
 console.log(JSON.stringify(report,null,2));
 }finally{await c.end();}
})().catch(e=>{console.error(e.message);process.exitCode=1;});
