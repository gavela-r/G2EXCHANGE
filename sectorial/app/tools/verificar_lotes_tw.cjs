// Integridad de los lotes TW_ANUAL_TRIMESTRAL_V1 (MySQL SÓLO LECTURA): huella de los PCV de FinMind y, por lote,
// filas de auditoría vigentes cuyo importe actual coincide con importe_nuevo. Una discrepancia indica una escritura
// posterior no auditada sobre una fila corregida.
// Uso: G2_PROJECT_ROOT=<proyecto con .env> node tools/verificar_lotes_tw.cjs
const{database}=require('../runtime.cjs');
const LOTES={lote1:'0314c4990758',lote2:'defddff25ac5',lote3:'d60c9f8a087c'};
(async()=>{
 const pool=database(),c=await pool.getConnection();
 try{
  await c.query('START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY');
  const[[a]]=await c.query("SELECT COUNT(*) n,BIT_XOR(CRC32(CONCAT_WS('|',p.id,p.informe_id,p.concepto_estandar_id,p.concepto,p.importe))) x FROM partida_contable_valor p JOIN informe_financiero i ON i.id=p.informe_id WHERE i.fuente='FINMIND'");
  const out={pcvFinmind:Number(a.n),huella:String(a.x),lotes:{}};let mal=0;
  for(const[k,pre]of Object.entries(LOTES)){const[[r]]=await c.query("SELECT COUNT(*) vigentes,COALESCE(SUM(NOT(p.importe<=>a.importe_nuevo)),0) discrepan FROM pcv_correccion_auditoria a JOIN partida_contable_valor p ON p.id=a.pcv_id AND p.informe_id=a.informe_id WHERE a.ledger_sha256 LIKE ? AND a.revertido_en IS NULL",[pre+'%']);out.lotes[k]={vigentes:Number(r.vigentes),discrepan:Number(r.discrepan)};mal+=Number(r.discrepan);}
  await c.rollback();console.log(JSON.stringify(out));if(mal)process.exitCode=1;
 }finally{c.release();await pool.end();}
})().catch(e=>{console.error(e.message);process.exitCode=1;});
