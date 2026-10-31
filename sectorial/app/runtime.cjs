const fs=require('node:fs'),path=require('node:path'),{createRequire}=require('node:module');
const {project}=require('./env.cjs');
const serviceRequire=createRequire(path.join(project,'server/package.json'));
function database(){
 const dotenv=serviceRequire('dotenv'),settings=dotenv.parse(fs.readFileSync(path.join(project,'.env')));
 const env=k=>process.env[k]??settings[k];
 const mysql=serviceRequire('mysql2/promise');
 return mysql.createPool({host:env('DB_HOST')??'localhost',port:Number(env('DB_PORT')??3307),user:env('DB_USER'),password:env('DB_PASSWORD'),database:env('DB_NAME'),dateStrings:true,timezone:'Z',connectionLimit:2,connectTimeout:5000,multipleStatements:false,decimalNumbers:false});
}
async function readOnly(pool,fn){const conn=await pool.getConnection();try{await conn.query('SET SESSION MAX_EXECUTION_TIME=8000');await conn.query('START TRANSACTION READ ONLY');const db={query:async(sql,params=[])=>{if(!/^\s*(SELECT|SHOW)\b/i.test(sql)||/;|\b(?:OUTFILE|DUMPFILE|FOR\s+UPDATE|LOCK\s+IN\s+SHARE)\b/i.test(sql))throw Error('Read-only SELECT/SHOW required');return conn.query({sql,timeout:10000},params);}};return await fn(db);}finally{await conn.rollback();conn.release();}}
module.exports={project,serviceRequire,database,readOnly};
