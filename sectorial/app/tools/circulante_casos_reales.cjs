// Días operativos, NWC y ΔNWC con datos reales: adapter.loadCompany (MySQL SÓLO LECTURA) → kpi.kpisForSnapshot.
// Uso: G2_PROJECT_ROOT=<proyecto con .env> node tools/circulante_casos_reales.cjs <asOf> <salida.json> "<nombre exacto>" ...
const fs=require('node:fs'),{database}=require('../runtime.cjs'),adapter=require('../adapter.cjs'),{kpisForSnapshot}=require('../kpi.cjs');
const CODES=['DSO','DPO_SOBRE_VENTAS','DIAS_INVENTARIO_SOBRE_VENTAS','CCC_SOBRE_VENTAS','DIO_SOBRE_COSTE','DPO_SOBRE_COSTE','CCC_CONVENCIONAL','DIAS_ACTIVOS_OPERATIVOS_AMPLIADOS_SOBRE_VENTAS','CAPITAL_CIRCULANTE_OPERATIVO','DELTA_NWC'];
(async()=>{
 const[asOf,out,...names]=process.argv.slice(2),db=database(),casos=[];
 try{
  for(const name of names){
   const[rows]=await db.query('SELECT e.id,p.codigo_iso FROM empresa e JOIN pais p ON p.id=e.pais_id WHERE e.nombre_empresa=? ORDER BY e.id LIMIT 2',[name]);
   if(rows.length!==1){casos.push({nombre:name,estado:rows.length?'NOMBRE_AMBIGUO':'NO_ENCONTRADA'});continue;}
   const snap=await adapter.loadCompany(db,Number(rows[0].id),asOf),k=kpisForSnapshot(snap);
   casos.push({nombre:name,pais:rows[0].codigo_iso,issues:snap.issues.map(x=>x.code),periodos:k.periods.map(p=>({cierre:p.periodEnd,moneda:snap.periods.find(x=>x.periodEnd===p.periodEnd)?.currency??null,indicadores:Object.fromEntries(p.kpis.filter(x=>CODES.includes(x.code)).map(x=>[x.code,x.status==='CERTIFICADO'?Number(x.value.toFixed(2)):x.status+': '+x.cause]))}))});
  }
 }finally{await db.end();}
 fs.writeFileSync(out,JSON.stringify({generatedAt:new Date().toISOString(),asOf,fuente:'MYSQL_SOLO_LECTURA via adapter.loadCompany + kpi.kpisForSnapshot',casos},null,1));
 for(const c of casos){console.log('==',c.nombre,c.pais??'',c.estado??'');for(const p of c.periodos??[])console.log(' ',p.cierre,p.moneda,JSON.stringify(p.indicadores));}
})().catch(e=>{console.error(e.message);process.exitCode=1;});
