// Escritor único de KPI (kpiSincronizarInforme) contra un MySQL con datos: dentro de una transacción que se revierte,
// aplicar y volver a sincronizar no cambia nada (idempotencia); los KPI de deuda exigen los dos componentes y el ROE
// perímetros conocidos e iguales. No modifica datos.
// Uso: DB_* de una copia aislada → node --test tests/kpiSincronizacion.integration.cjs
const test=require('node:test'),assert=require('node:assert/strict');
const pool=require('../dist/conexion/bd').default,K=require('../dist/insercionDatos/insercionKPIInformeFinanciero');
test('kpiSincronizarInforme: idempotente y conforme a las reglas vigentes en una muestra de informes',async()=>{
 const c=await pool.getConnection();
 try{
  const[ids]=await c.query("SELECT informe_id id FROM (SELECT DISTINCT informe_id FROM kpi_financiero_informe ORDER BY informe_id LIMIT 4000) x ORDER BY RAND(7) LIMIT 60");
  assert.ok(ids.length>0,'requiere KPI persistidos');
  await c.beginTransaction();
  for(const {id} of ids){
   await K.kpiSincronizarInforme(c,id,true);
   const r=await K.kpiSincronizarInforme(c,id,false);
   assert.equal(r.escribir.length+r.eliminados.length,0,'segunda pasada sin cambios en '+id);
   const[rows]=await c.query('SELECT kpi FROM kpi_financiero_informe WHERE informe_id=?',[id]);const kpis=new Set(rows.map(x=>x.kpi));
   assert.deepEqual([...kpis].sort(),r.vigentes.map(k=>k.kpi).sort(),'persistido = vigente en '+id);
   if([...K.KPI_DEUDA].some(k=>kpis.has(k))){const[[d]]=await c.query("SELECT COUNT(DISTINCT t.concepto_estandar) n FROM partida_contable_valor p JOIN taxonomia_concepto t ON t.id=p.concepto_estandar_id WHERE p.informe_id=? AND p.importe IS NOT NULL AND t.concepto_estandar IN ('DEUDA_CORTO_PLAZO','DEUDA_LARGO_PLAZO')",[id]);assert.equal(Number(d.n),2,'deuda con ambos componentes en '+id);}
  }
 }finally{await c.rollback().catch(()=>{});c.release();await pool.end();}
});
