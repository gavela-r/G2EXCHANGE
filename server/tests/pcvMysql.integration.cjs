// Explicit opt-in integration test. All writes target session TEMPORARY tables.
const {test}=require('node:test'),assert=require('node:assert/strict');
const pool=require('../dist/conexion/bd').default,{persistirRecuperacion}=require('../dist/src/pcv/persistirRecuperacion');
test('MySQL PCV: atomic provenance, NULL fill, original preservation, recalculation and replay idempotence',async()=>{
 const c=await pool.getConnection();try{
 for(const t of ['informe_financiero','partida_contable_valor','taxonomia_concepto','kpi_financiero_informe','pcv_import_evidence']){const [[row]]=await c.query('SHOW CREATE TABLE '+t);await c.query(row['Create Table'].replace('CREATE TABLE','CREATE TEMPORARY TABLE').replace(/\n  CONSTRAINT [^\n]+/g,'').replace(/,\s*\) ENGINE/,'\n) ENGINE'));}
 await c.query("INSERT INTO informe_financiero(id,empresa_id,tipo_periodo,fecha_fin_periodo,fuente,identificador_fuente) VALUES(1,2,'ANUAL','2024-12-31','SEC_EDGAR','SYNTHETIC')");
 await c.query("INSERT INTO taxonomia_concepto(id,concepto_estandar,categoria,activo) VALUES(1,'INGRESOS','CUENTA_RESULTADOS',1),(2,'EBIT','CUENTA_RESULTADOS',1),(3,'BENEFICIO_NETO','CUENTA_RESULTADOS',1)");
 await c.query("INSERT INTO partida_contable_valor(id,informe_id,concepto_estandar_id,concepto,importe) VALUES(1,1,1,'Revenues',100),(2,1,2,'old-null',NULL)");
 const p={getConnection:async()=>({query:c.query.bind(c),beginTransaction:c.beginTransaction.bind(c),commit:c.commit.bind(c),rollback:c.rollback.bind(c),release(){}})};
 const i={id:1,empresa_id:2,end:'2024-12-31',accession:'SYNTHETIC',country:'US'},d=(codigo,importe)=>({codigo,importe,concepto:'SYNTHETIC:'+codigo,provider:'SEC_EDGAR',identifier:'SYNTHETIC',currency:'USD',basis:'consolidated',evidence:{end:i.end}});
 const failing={getConnection:async()=>({...await p.getConnection(),query:async(sql,params)=>{if(sql.startsWith('INSERT INTO pcv_import_evidence'))throw new Error('injected provenance failure');return c.query(sql,params);}})};
 await assert.rejects(()=>persistirRecuperacion(failing,i,[d('EBIT',25)],true),/injected/);assert.equal((await c.query('SELECT importe FROM partida_contable_valor WHERE id=2'))[0][0].importe,null);
 const trial=await persistirRecuperacion(p,i,[d('EBIT',25),d('BENEFICIO_NETO',20)],false);assert.equal(trial.pcv,2);assert.equal((await c.query('SELECT COUNT(*) n FROM pcv_import_evidence'))[0][0].n,0);
 const r=await persistirRecuperacion(p,i,[d('EBIT',25),d('BENEFICIO_NETO',20)],true);assert.equal(r.pcv,2);assert.ok(r.kpiNew>0);
 const again=await persistirRecuperacion(p,i,[d('EBIT',999),d('BENEFICIO_NETO',999)],true);assert.equal(again.pcv,0);assert.equal(again.kpiNew,0);assert.equal(again.kpiUpdated,0);
 assert.equal((await c.query('SELECT importe FROM partida_contable_valor WHERE id=1'))[0][0].importe,'100.0000');
 assert.equal((await c.query("SELECT COUNT(*) n FROM pcv_import_evidence WHERE record_type='PCV'"))[0][0].n,2);
 await assert.rejects(()=>persistirRecuperacion(p,i,[d('INGRESOS',200)],true),/CONTRADICTORIA/);
 }finally{c.release();await pool.end();}
});
