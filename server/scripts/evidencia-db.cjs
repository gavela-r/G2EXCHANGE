const path=require('node:path');require('dotenv').config({path:path.resolve(__dirname,'../../.env')});const mysql=require('mysql2/promise');
(async()=>{const c=await mysql.createConnection({host:process.env.DB_HOST,port:Number(process.env.DB_PORT),user:process.env.DB_USER,password:process.env.DB_PASSWORD,database:process.env.DB_NAME,dateStrings:true});try{
 for(const sql of [
 'SELECT DISTINCT perfil_empresa,fuente_intervalos,fuente_spread_mercado,fecha_datos_mercado FROM rating_sintetico',
 'SELECT fuente,COUNT(*) n FROM informe_financiero GROUP BY fuente',
 'SELECT inf.empresa_id,inf.identificador_fuente FROM informe_financiero inf JOIN empresa e ON e.id=inf.empresa_id WHERE e.sector_id=221 LIMIT 8',
 'SELECT tc.concepto_estandar,tc.alias_sec,tc.alias_edinet,tc.alias_finmind FROM taxonomia_concepto tc WHERE tc.concepto_estandar IN (\'DEPRECIACION_AMORTIZACION\',\'ACCIONES_EN_CIRCULACION\',\'CAPEX\',\'DEUDA_TOTAL\')',
 'SELECT COUNT(*) n FROM valuation_input_version WHERE acciones_en_circulacion>0',
 'SELECT p.codigo_iso,COUNT(*) n FROM empresa e JOIN pais p ON p.id=e.pais_id WHERE e.sector_id=221 GROUP BY p.codigo_iso'
 ])console.log(JSON.stringify({sql,rows:(await c.query(sql))[0]}));
}finally{await c.end();}})().catch(e=>{console.error(e.message);process.exitCode=1;});
