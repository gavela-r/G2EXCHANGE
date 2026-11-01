// Cobertura con la definición adaptativa sobre un extracto de históricos (tools/historicos_mysql.cjs):
//  - cobertura histórica APLICABLE = (certificados + derivados) / (aplicables) en los ejercicios consecutivos disponibles
//    (NO_APLICABLE acreditado fuera del denominador; un ejercicio sin informe no cuenta como aplicable);
//  - datos críticos del último cierre (adaptativo.CRITICOS), ≥ 2 ejercicios consecutivos, ingresos/EBIT/D&A con ≥ 2 años;
//  - candidata a valoración adaptativa = clasificación resuelta + plantilla con proyección automática + ≥ 85 % + críticos.
// No sustituye a la ejecución real: una empresa sólo es VALORABLE si tools/valorar_adaptativo.cjs calcula y valida su Excel.
// Uso: node tools/cobertura_adaptativa.cjs <historicos.json> <salida.json> [--candidatas ids.txt]
const fs=require('node:fs'),path=require('node:path'),{model}=require(path.join(__dirname,'..','registry.cjs')),AD=require(path.join(__dirname,'..','adaptativo.cjs')),P=require(path.join(__dirname,'..','proyeccion.cjs'));
const [entrada,salida]=process.argv.slice(2),H=JSON.parse(fs.readFileSync(entrada,'utf8')),arg=k=>{const i=process.argv.indexOf(k);return i>=0?process.argv[i+1]:null;};
const usable=c=>c&&c.v!=null&&['VALIDADO','DERIVADO','NO_APLICABLE'].includes(c.e);
const filas=[];
for(const e of H.empresas){
 const m=model(e.plantilla),f={id:e.id,nombre:e.nombre,pais:e.pais,plantilla:e.plantilla,clasificacion:e.clasificacion,motivos:[]};
 const t=P.tramo(e.ejercicios.map(p=>({year:p.fy,value:1}))),ys=new Set(t.map(x=>x.year)),ps=e.ejercicios.filter(p=>ys.has(p.fy));f.ejercicios=ps.length;
 const c={certificados:0,derivados:0,noAplicables:0,ausentes:0};
 if(m)for(const p of ps)for(const k of m.requiredHistory){const x=p.campos[k];if(x?.e==='NO_APLICABLE')c.noAplicables++;else if(x?.e==='VALIDADO'&&x.v!=null)c.certificados++;else if(x?.e==='DERIVADO'&&x.v!=null)c.derivados++;else c.ausentes++;}
 const aplicables=c.certificados+c.derivados+c.ausentes;f.cobertura=aplicables?(c.certificados+c.derivados)/aplicables:0;Object.assign(f,c);
 const last=ps.at(-1);
 f.criticosAusentes=last?AD.CRITICOS.filter(k=>!usable(last.campos[k])):AD.CRITICOS.slice();
 const serie=k=>ps.filter(p=>usable(p.campos[k])).length;
 f.criticos=!!last&&ps.length>=2&&!f.criticosAusentes.length&&['revenue','ebit','da'].every(k=>serie(k)>=2)&&!(last.campos.nci?.e==='VALIDADO'&&Number(last.campos.nci.v)!==0)&&!last.problemas?.length;
 if(e.clasificacion!=='RESUELTO')f.motivos.push('CLASIFICACION_NO_RESUELTA');
 if(m&&!AD.SOPORTADAS.has(m.id))f.motivos.push('PLANTILLA_SIN_PROYECCION_AUTOMATICA');
 if(!ps.length)f.motivos.push('SIN_INFORMES_ACREDITADOS');else if(ps.length<2)f.motivos.push('UN_SOLO_EJERCICIO');
 if(last?.problemas?.length)f.motivos.push('ULTIMO_CIERRE_SIN_CONTEXTO_VERIFICADO');
 if(f.cobertura<0.85)f.motivos.push('COBERTURA_APLICABLE_INFERIOR_85');
 for(const k of f.criticosAusentes)f.motivos.push('CRITICO:'+k);
 if(last?.campos.nci?.e==='VALIDADO'&&Number(last.campos.nci.v)!==0)f.motivos.push('MINORITARIOS_SIN_TRATAMIENTO');
 f.candidata=e.clasificacion==='RESUELTO'&&!!m&&AD.SOPORTADAS.has(m.id)&&f.cobertura>=0.85&&f.criticos;
 filas.push(f);
}
const cuenta=(rows,fn)=>{const o={};for(const r of rows){const k=fn(r);o[k]=(o[k]||0)+1;}return Object.fromEntries(Object.entries(o).sort((a,b)=>b[1]-a[1]));};
const res=rows=>({empresas:rows.length,conInformes:rows.filter(r=>r.ejercicios>0).length,cobertura85:rows.filter(r=>r.cobertura>=0.85).length,criticosSuficientes:rows.filter(r=>r.criticos).length,cobertura85YCriticos:rows.filter(r=>r.cobertura>=0.85&&r.criticos).length,clasificacionResuelta:rows.filter(r=>r.clasificacion==='RESUELTO').length,candidatas:rows.filter(r=>r.candidata).length,
 tramos:{'100':rows.filter(r=>r.cobertura>=0.9999).length,'90-99':rows.filter(r=>r.cobertura>=0.9&&r.cobertura<0.9999).length,'85-89':rows.filter(r=>r.cobertura>=0.85&&r.cobertura<0.9).length,'75-84':rows.filter(r=>r.cobertura>=0.75&&r.cobertura<0.85).length,'<75':rows.filter(r=>r.cobertura<0.75).length}});
const motivos={};for(const r of filas)for(const mo of new Set(r.motivos.map(x=>x.startsWith('CRITICO:')?x:x)))motivos[mo]=(motivos[mo]||0)+1;
const out={version:'G2_COBERTURA_ADAPTATIVA_0.1',fuente:{archivo:path.basename(entrada),medidoEn:H.medidoEn,base:H.base},definicion:'Cobertura aplicable ≥ 85 % + críticos del último cierre + clasificación resuelta + plantilla con proyección automática',
 total:res(filas),porPais:Object.fromEntries(['US','JP','TW'].map(p=>[p,res(filas.filter(r=>r.pais===p))])),porPlantilla:Object.fromEntries(Array.from({length:16},(_,i)=>[i+1,res(filas.filter(r=>r.plantilla===i+1))])),
 motivosBloqueo:Object.fromEntries(Object.entries(motivos).sort((a,b)=>b[1]-a[1])),criticosMasAusentes:cuenta(filas.filter(r=>r.ejercicios>0).flatMap(r=>r.criticosAusentes.map(k=>({k}))),x=>x.k),empresas:filas};
fs.writeFileSync(salida,JSON.stringify(out));
if(arg('--candidatas'))fs.writeFileSync(arg('--candidatas'),filas.filter(r=>r.candidata).map(r=>r.id).join('\n'));
console.log(JSON.stringify({total:out.total,porPais:out.porPais},null,1));
