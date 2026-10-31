// Detecta informes con IDENTIDAD CRUZADA: la fuente del informe no corresponde al país de la empresa (p. ej. documentos
// EDINET de emisores japoneses asignados por colisión de código bursátil a empresas de Taiwán: TSMC 2330, MediaTek
// 2454…). MySQL SÓLO LECTURA. Genera, sin ejecutar:
//  - server/sql/32_informe_identidad_cuarentena.sql (+ rollback): tabla de cuarentena (no borra nada);
//  - <dirPrivado>/32_cuarentena_<fecha>.sql: INSERT de los informes detectados, con su motivo.
// Uso: G2_PROJECT_ROOT=<proyecto> node tools/cuarentena_identidad.cjs <dirPrivado>
const fs=require('node:fs'),path=require('node:path');
const{database}=require('../runtime.cjs');
const FUENTES_PAIS={US:['SEC_EDGAR'],JP:['EDINET'],TW:['FINMIND','MOPS']};
const ESQUEMA=`-- 32_informe_identidad_cuarentena.sql — PREPARADA, NO EJECUTADA.
-- Informes cuya fuente no corresponde al país de la empresa (identidad cruzada por colisión de código bursátil).
-- No se borra ni modifica ningún informe ni PCV: la cuarentena sólo los excluye de selección y certificación.
CREATE TABLE IF NOT EXISTS informe_identidad_cuarentena (
  informe_id INT NOT NULL PRIMARY KEY,
  empresa_id INT NOT NULL,
  pais_empresa CHAR(2) NOT NULL,
  fuente_informe VARCHAR(40) NOT NULL,
  identificador_fuente VARCHAR(255) NULL,
  motivo VARCHAR(80) NOT NULL,
  detectado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_cuarentena_informe FOREIGN KEY (informe_id) REFERENCES informe_financiero(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
`;
async function main(dir){
 const pool=database(),conn=await pool.getConnection();let filas;
 try{await conn.query('START TRANSACTION READ ONLY');
  const casos=Object.entries(FUENTES_PAIS).map(([p,f])=>`(pa.codigo_iso='${p}' AND i.fuente NOT IN (${f.map(x=>`'${x}'`).join(',')}))`).join(' OR ');
  [filas]=await conn.query(`SELECT i.id,i.empresa_id,pa.codigo_iso pais,i.fuente,i.identificador_fuente,YEAR(i.fecha_fin_periodo) y FROM informe_financiero i JOIN empresa e ON e.id=i.empresa_id JOIN pais pa ON pa.id=e.pais_id WHERE ${casos} ORDER BY i.id`);
  await conn.rollback();}finally{conn.release();await pool.end();}
 fs.mkdirSync(dir,{recursive:true});
 const q=v=>v===null?'NULL':"'"+String(v).replace(/'/g,"''")+"'",fecha=new Date().toISOString().slice(0,10);
 const sql=['-- Generado '+new Date().toISOString()+'. NO EJECUTADO. Requiere el esquema 32.','START TRANSACTION;',...filas.map(r=>`INSERT IGNORE INTO informe_identidad_cuarentena(informe_id,empresa_id,pais_empresa,fuente_informe,identificador_fuente,motivo) VALUES(${r.id},${r.empresa_id},${q(r.pais)},${q(r.fuente)},${q(r.identificador_fuente)},'FUENTE_NO_CORRESPONDE_AL_PAIS');`),'COMMIT;'].join('\n');
 const file=path.join(dir,`32_cuarentena_${fecha}.sql`);fs.writeFileSync(file,sql+'\n');
 const sqlDir=path.resolve(__dirname,'../../../server/sql');fs.writeFileSync(path.join(sqlDir,'32_informe_identidad_cuarentena.sql'),ESQUEMA);fs.writeFileSync(path.join(sqlDir,'32_informe_identidad_cuarentena.rollback.sql'),'-- Rollback del esquema 32.\nDROP TABLE IF EXISTS informe_identidad_cuarentena;\n');
 const resumen={};for(const r of filas){const k=r.pais+' ← '+r.fuente;(resumen[k]??={informes:0,empresas:new Set(),porAnio:{}});resumen[k].informes++;resumen[k].empresas.add(r.empresa_id);resumen[k].porAnio[r.y]=(resumen[k].porAnio[r.y]??0)+1;}
 return{file,total:filas.length,resumen:Object.fromEntries(Object.entries(resumen).map(([k,v])=>[k,{informes:v.informes,empresas:v.empresas.size,porAnio:v.porAnio}]))};
}
if(require.main===module){const dir=process.argv[2];if(!dir){console.error('Uso: node tools/cuarentena_identidad.cjs <dirPrivado>');process.exit(2);}
 main(path.resolve(dir)).then(r=>console.log(JSON.stringify(r,null,1))).catch(e=>{console.error(e.message);process.exitCode=1;});}
