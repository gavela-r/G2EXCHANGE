import express from 'express';
import {createPool} from 'mysql2/promise';
import dotenv from 'dotenv';
import path from 'node:path';
import {raizProyecto} from '../valoracion/rutas';
import {capitalRouter} from './api';
import {manifiestoCapital} from './manifiesto';
dotenv.config({path:path.join(raizProyecto(),'.env')});
const database=process.env.CAPITAL_DB_NAME??'g2_capital_dev_20261029';
if(!/^g2_capital_dev_[a-zA-Z0-9_]+$/.test(database)||database===process.env.DB_NAME)throw Error('Usar copia de desarrollo explícita, distinta de base operativa');
export const pool=createPool({host:process.env.DB_HOST??'localhost',port:Number(process.env.DB_PORT??3307),user:process.env.DB_USER,password:process.env.DB_PASSWORD,database,dateStrings:true,timezone:'Z',connectionLimit:4,connectTimeout:5000});
export const app=express();app.use(express.json({limit:'1mb'}));
app.use((req,res,next)=>{if(!/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(req.headers.host??'')){res.status(403).end();return;}next();});
app.use('/api/capital',capitalRouter(pool,{localReview:true}));
app.use(express.static(path.join(raizProyecto(),'client/dist')));
app.get('/',(_q,r)=>r.sendFile(path.join(raizProyecto(),'client/dist/index.html')));
if(require.main===module){
 (async()=>{manifiestoCapital();const [[v]]:any=await pool.query("SELECT version FROM capital_schema_version WHERE version='2.3.0'");if(!v)throw Error('Migraciones capital v2 incompletas');const server=app.listen(Number(process.env.CAPITAL_PORT??3100),'127.0.0.1',()=>console.log(`G2 capital v2: http://127.0.0.1:${process.env.CAPITAL_PORT??3100} · ${database} · PID ${process.pid}`));
 server.on('error',(e:NodeJS.ErrnoException)=>{console.error(`No se pudo iniciar Capital v2: ${e.code}`);void pool.end();process.exitCode=1;});
 const close=()=>server.close(()=>{void pool.end();});process.on('SIGINT',close);process.on('SIGTERM',close);
 })().catch(e=>{console.error(e.code??e.message);void pool.end();process.exitCode=1;});
}
