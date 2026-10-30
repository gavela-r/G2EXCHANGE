/* Rollback conservador: sólo retira tablas de la migración si TODAS están vacías.
 * Nunca elimina histórico ni decisiones. Aplicación con datos: retirar servicio, conservar tablas.
 */
const {options,target,checkTarget}=require('./capital-dev.cjs');checkTarget();const mysql=require('../node_modules/mysql2/promise');
const tables=['capital_instrument_alias','capital_decision','capital_download_checkpoint','capital_analysis','capital_methodology','capital_financial_evidence','capital_daily_observation','capital_identity_evidence'];
(async()=>{const c=await mysql.createConnection({...options(),database:target});try{const counts={};
 for(const t of tables){const [[exists]]=await c.query('SELECT COUNT(*) n FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=?',[t]);if(!exists.n){counts[t]=0;continue;}const [[r]]=await c.query('SELECT COUNT(*) n FROM `'+t+'`');counts[t]=r.n;}
 if(Object.values(counts).some(n=>n!==0))throw Error('ROLLBACK_BLOQUEADO_DATOS_EXISTENTES: no se elimina histórico; retirar servicio y conservar tablas');
 if(!process.argv.includes('--apply-empty')){console.log(JSON.stringify({database:target,mode:'CHECK_ONLY',counts}));return;}
 const [duplicates]=await c.query('SELECT ticker,COUNT(*) n FROM instrumento GROUP BY ticker HAVING COUNT(*)>1 LIMIT 1');if(duplicates.length)throw Error('ROLLBACK_IDENTIDAD_BLOQUEADO: existen tickers válidos en varios mercados; no eliminar ni fusionar instrumentos');
 const [indexes]=await c.query("SELECT DISTINCT INDEX_NAME FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='instrumento'");const names=new Set(indexes.map(x=>x.INDEX_NAME));
 if(!names.has('ticker'))await c.query('ALTER TABLE instrumento ADD UNIQUE KEY ticker(ticker)');
 await c.query("DELETE FROM capital_schema_version WHERE version IN ('2.0.0','2.1.0','2.2.0','2.3.0')");
 for(const t of tables)await c.query('DROP TABLE IF EXISTS `'+t+'`');
 if(names.has('uq_instrument_market_ticker'))await c.query('ALTER TABLE instrumento DROP INDEX uq_instrument_market_ticker');
 if(names.has('ix_instrument_ticker_lookup'))await c.query('ALTER TABLE instrumento DROP INDEX ix_instrument_ticker_lookup');
 console.log(JSON.stringify({database:target,revertedEmptySchema:true,modelVersionMetadataPreserved:true}));
 }finally{await c.end();}})().catch(e=>{console.error(e.message);process.exitCode=1;});
