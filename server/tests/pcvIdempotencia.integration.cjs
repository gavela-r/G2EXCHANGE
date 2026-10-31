// Recuperaciones idempotentes con la identidad de observación (migración 33). Integración explícita contra un MySQL
// con la migración aplicada; todo ocurre en una tabla TEMPORARY de la sesión (no modifica datos).
// Uso: DB_* de una copia aislada → node --test tests/pcvIdempotencia.integration.cjs
const test=require('node:test'),assert=require('node:assert/strict');
const pool=require('../dist/conexion/bd').default,{identidadObservacion}=require('../dist/src/pcv/seleccionObservaciones');
test('repetir una carga FinMind, SEC/EDINET verificada o «sólo ausentes» no crea duplicados ni toca otro informe',async()=>{
 const c=await pool.getConnection();
 try{
  const [[row]]=await c.query('SHOW CREATE TABLE partida_contable_valor');
  assert.match(row['Create Table'],/uq_pcv_identidad_observacion/,'requiere la migración 33');
  await c.query(row['Create Table'].replace('CREATE TABLE','CREATE TEMPORARY TABLE').replace(/\n  CONSTRAINT [^\n]+/g,'').replace(/,\s*\) ENGINE/,'\n) ENGINE'));
  const [[{n:n0}]]=await c.query('SELECT COUNT(*) n FROM partida_contable_valor');
  const filas=[[1,7,'Revenue',6859615493000,'ALTA'],[1,8,'GrossProfit',428945918000,'ALTA'],[2,7,'Revenue',5000,'ALTA']];
  // FinMind (twOptGuardarPartidas): INSERT … VALUES ? ON DUPLICATE KEY UPDATE id = id, dos veces; la segunda con otro
  // importe no sustituye el registrado (original o corregido con auditoría).
  const tw=f=>c.query('INSERT INTO partida_contable_valor(informe_id,concepto_estandar_id,concepto,importe,nivel_confianza,identidad_observacion) VALUES ? ON DUPLICATE KEY UPDATE id = id',[f.map(x=>[...x,identidadObservacion(x[0],x[1],x[2])])]);
  await tw(filas);await tw(filas.map(f=>f[0]===1&&f[1]===7?[1,7,'Revenue',1,'ALTA']:f));
  const [[{r}]]=await c.query('SELECT importe r FROM partida_contable_valor WHERE informe_id=1 AND concepto_estandar_id=7');
  assert.equal(Number(r),6859615493000,'una recarga no sobrescribe el importe existente');
  // Ruta verificada (persistirRecuperacionVerificada / persistirRecuperacion) y «sólo ausentes».
  const ver=()=>c.query('INSERT INTO partida_contable_valor(informe_id,concepto,concepto_estandar_id,importe,nivel_confianza,identidad_observacion) VALUES(?,?,?,?,?,?) ON DUPLICATE KEY UPDATE id=LAST_INSERT_ID(id)',[3,'NetIncomeLoss',9,112010000000,'ALTA',identidadObservacion(3,9,'NetIncomeLoss')]);
  const [a]=await ver(),[b]=await ver();assert.equal(a.insertId,b.insertId,'la segunda ejecución devuelve la misma fila');
  const aus=()=>c.query('INSERT INTO partida_contable_valor (informe_id,concepto_estandar_id,concepto,importe,nivel_confianza,identidad_observacion) VALUES (?,?,?,?,?,?) ON DUPLICATE KEY UPDATE id=id',[4,10,'Assets',359241000000,'ALTA',identidadObservacion(4,10,'Assets')]);
  await aus();await aus();
  const [[{n}]]=await c.query('SELECT COUNT(*) n FROM partida_contable_valor');
  assert.equal(Number(n)-Number(n0),5,'5 observaciones distintas, sin duplicados');
  const [[{v}]]=await c.query('SELECT importe v FROM partida_contable_valor WHERE informe_id=2 AND concepto_estandar_id=7');
  assert.equal(Number(v),5000,'el mismo concepto de otro informe (otro periodo) no se sobrescribe');
  // Identidad TS = fórmula SQL de la migración.
  const [[{h}]]=await c.query("SELECT SHA2(CONCAT_WS('|',1,7,'Revenue'),256) h");assert.equal(h,identidadObservacion(1,7,'Revenue'));
 }finally{await c.query('DROP TEMPORARY TABLE IF EXISTS partida_contable_valor').catch(()=>{});c.release();await pool.end();}
});
