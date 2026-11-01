import * as XLSX from 'xlsx';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {raizProyecto} from '../valoracion/rutas';
import {createHash} from 'node:crypto';
import {integrarPrimasExcel} from './excelAutomatico';
const monedaInforme=(p:any)=>p.fuenteCongelada?.input?.currency??p.periodos?.find((r:any)=>r.periodo?.fin===p.periodoSeleccionado)?.moneda??'NO_ACREDITADA';
/** Nuevos informes: los maestros y los informes históricos nunca se escriben. */
export function exportarExcel(payload:any,decisions:any=[]):Buffer{
 let book=XLSX.utils.book_new();
 if(payload.fuenteCongelada){
  const source=payload.fuenteCongelada,root=raizProyecto();
  if(!/^[a-f0-9]{64}$/.test(source.manifestHash))throw Error('Manifiesto congelado requerido para exportar el modelo sectorial');
  const archive=path.join(root,'valuation_engine/archives',source.manifestHash),writer=path.join(archive,'dist/src/reportes/excel.js');
  if(!fs.existsSync(writer))throw Error('Generador histórico no archivado: no sustituirlo por otro');
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'g2-capital-report-')),file=path.join(temp,'sector.xlsx');
  try{
   const masterRoot=fs.existsSync(path.join(archive,'templates'))?archive:path.join(root,'valuation_engine');
   if(masterRoot!==archive){const baseline=JSON.parse(fs.readFileSync(path.join(root,'valuation_engine/research/coste_capital/evidencias/compatibilidad_inicial.json'),'utf8'));
    const files=fs.readdirSync(path.join(masterRoot,'templates')).filter(f=>f.startsWith(`Template_${source.input.template_code}_`)&&f.endsWith('.xlsx'));
    if(files.length!==1)throw Error('Maestro sectorial ausente o ambiguo');const relative='valuation_engine/templates/'+files[0],digest=createHash('sha256').update(fs.readFileSync(path.join(root,relative))).digest('hex');
    if(baseline.files[relative]!==digest)throw Error('Maestro original ha cambiado; no regenerar informe histórico con otra plantilla');
   }
   require(writer).escribirExcel(source.input,source.output,file,masterRoot);book=XLSX.readFile(file,{cellFormula:true,cellStyles:true,cellNF:true});
  }
  finally{if(fs.existsSync(file))fs.unlinkSync(file);fs.rmdirSync(temp);}
 }
 const auto=payload.primasAutomaticas;
 const summary:any[][]=[['G2EXCHANGE · CAPITAL v2'],['Modo',auto?'PRIMAS AUTOMÁTICAS · ESTADO Y AJUSTE OPERATIVO EN Primas_auto':'DIAGNOSTICO / HIPOTESIS; NO PRIMA AUTORIZADA'],['Empresa',payload.empresa?.nombre_empresa??payload.empresaNombre??'Run '+payload.runOriginal],['Fecha',payload.fecha??payload.fechaValoracion??'Ver snapshot'],['Liquidez bursátil',auto?.primas[0]?.estadoFinanciero??'NO_ESTIMABLE'],['Tamaño residual',auto?.primas[1]?.estadoFinanciero??'NO_ESTIMABLE'],['Concentración de clientes','EXCLUIDA de nuevas primas'],['ERP total','Ya incluye riesgo país']];
 summary[2].push('Moneda',monedaInforme(payload));summary[3].push('Unidades','EV y Equity en millones; valor/acción en moneda por acción');
 if(payload.escenarios){
  summary.push([],['Escenario','Ke base','Kd base','Peso E','Peso D','Fiscalidad','Delta Ke manual (pb)','Delta Kd manual (pb)','Ke simulado','Kd simulado','WACC base','WACC simulado','Estado primas','WACC histórico']);
  for(const [index,s] of payload.escenarios.entries()){const row=summary.length+1,c='BCD'[index];
   summary.push([s.escenario,s.keBase,s.kdBase,s.pesoPatrimonio??s.pesos?.patrimonio??null,s.pesoDeuda??s.pesos?.deuda??null,s.impuesto??null,s.hipotesis?.keBps??0,s.hipotesis?.kdBps??0,
    {t:'n',f:auto?`'Primas_auto'!${c}26`:`B${row}+G${row}/10000`,v:s.keAjustado},{t:'n',f:auto?`'Primas_auto'!${c}27`:`C${row}+H${row}/10000`,v:s.kdAjustado},s.waccBase,
    auto&&!s.waccAplicable?'NO_APLICABLE':{t:'n',f:`I${row}*D${row}+J${row}*(1-F${row})*E${row}`,v:s.waccAjustado},auto?s.primasAutomaticas.primas.map((p:any)=>p.estadoFinanciero).join(' / '):'NO_ESTIMABLE',s.waccHistorico]);
  }
  summary.push([],['Escenario','EV original','EV simulado','Equity original','Equity simulado','Valor/acción original','Valor/acción simulado','Diferencia absoluta','Diferencia %']);
  for(const s of payload.escenarios){const i=s.impacto;summary.push([s.escenario,i.original?.valor_empresa_millones??'NO_APLICABLE',i.ajustado?.valor_empresa_millones??'NO_APLICABLE',i.original?.valor_patrimonio_millones??'NO_ESTIMABLE',i.ajustado?.valor_patrimonio_millones??'NO_ESTIMABLE',i.original?.fair_value??'NO_ESTIMABLE',i.ajustado?.fair_value??'NO_ESTIMABLE',i.diferenciaAbsoluta??'NO_ESTIMABLE',i.diferenciaPorcentual??'NO_ESTIMABLE']);}
 }
 const ws=XLSX.utils.aoa_to_sheet(summary);ws['!cols']=[{wch:42},...Array.from({length:13},()=>({wch:22}))];
 for(let row=11;row<=13;row++)if(['CONSERVATIVE','BASE','OPTIMISTIC'].includes(summary[row-1]?.[0]))for(const col of ['B','C','D','E','F','I','J','K','L','N'])if(ws[col+row])ws[col+row].z='0.00%';
 XLSX.utils.book_append_sheet(book,ws,'Capital_v2');book.SheetNames= ['Capital_v2',...book.SheetNames.filter(n=>n!=='Capital_v2')];
 if(payload.indicadores){const rows=[['Indicador','Valor','Unidad','Moneda','Periodo','Fuente','Limitaciones'],...payload.indicadores.map((i:any)=>[i.id,i.valor??'NO_ESTIMABLE',i.unidad,i.moneda??'',i.periodoFin,i.fuentes.map((f:any)=>f.identificador).join('; '),i.limitaciones.join('; ')])];const sh=XLSX.utils.aoa_to_sheet(rows);sh['!cols']=[{wch:32},{wch:25},{wch:18},{wch:12},{wch:15},{wch:65},{wch:85}];XLSX.utils.book_append_sheet(book,sh,'Indicadores');}
 const evidenceRows:any[][]=[['Tipo','Contenido']];
 for(const [label,value] of [['Trazabilidad',payload],['Decisiones',decisions]] as const){const text=JSON.stringify(value);let index=0,part=1;while(index<text.length){let end=Math.min(index+30000,text.length);const last=text.charCodeAt(end-1);if(last>=0xD800&&last<=0xDBFF)end--;evidenceRows.push([`${label} parte ${part++}`,text.slice(index,end)]);index=end;}}
 evidenceRows.push(['Nota','JSON completo dividido en partes por el límite de celda; conservar su orden. No sustituye el modelo maestro ni la valoración congelada']);
 const ev=XLSX.utils.aoa_to_sheet(evidenceRows);ev['!cols']=[{wch:25},{wch:120}];XLSX.utils.book_append_sheet(book,ev,'Evidencias');
 integrarPrimasExcel(book,payload);
 return XLSX.write(book,{type:'buffer',bookType:'xlsx',cellStyles:true});
}
export function exportarPdf(payload:any,decisions:any=[]):Buffer{
 const num=(x:unknown,rate=false)=>{if(typeof x!=='number'||!Number.isFinite(x))return 'NO_ESTIMABLE';const n=x*(rate?100:1);return (n!==0&&Math.abs(n)<.0001?n.toExponential(4):new Intl.NumberFormat('es-ES',{maximumFractionDigits:4}).format(n))+(rate?' %':'');};
 const lines:string[]=[payload.primasAutomaticas?'PRIMAS AUTOMATICAS. VER ESTADO Y APROBACION.':'DIAGNOSTICO / HIPOTESIS MANUAL. NO PRIMA AUTORIZADA.',`Empresa: ${payload.empresa?.nombre_empresa??payload.empresaNombre??'Run '+payload.runOriginal}`,`Fecha: ${payload.fecha??payload.fechaValoracion??'Ver snapshot original'}`,`Moneda: ${monedaInforme(payload)} | Valor/accion: moneda por accion`,'',...(payload.primasAutomaticas?payload.primasAutomaticas.primas.flatMap((p:any)=>[`${p.factor}: operativa ${num(p.ajusteOperativo,true)} | calculada ${num(p.primaCalculada,true)}`,`${p.estadoFinanciero} | ${p.estadoAplicacion} | ${p.componente}`,p.motivo]):['Prima liquidez: NO_ESTIMABLE | Prima tamano residual: NO_ESTIMABLE']),'ERP total ya incluye riesgo pais. No se duplica.','Concentracion de clientes excluida de nuevas primas.',''];
 for(const i of payload.indicadores??[]){lines.push(`${i.id}: ${num(i.valor)} ${i.moneda??i.unidad}`);for(const f of i.fuentes??[])lines.push('Fuente: '+f.identificador);}
 for(const s of payload.escenarios??[]){lines.push('',s.escenario,`Ke base ${num(s.keBase,true)} | simulado ${num(s.keAjustado,true)}`,`Kd base ${num(s.kdBase,true)} | simulado ${num(s.kdAjustado,true)}`,`WACC base ${num(s.waccBase,true)} | simulado ${num(s.waccAjustado,true)}`,`WACC historico ${num(s.waccHistorico,true)}`,`Valor/accion original ${num(s.impacto.original?.fair_value)}`,`Valor/accion simulado ${num(s.impacto.ajustado?.fair_value)}`);}
 lines.push('','REVISION Y TRAZABILIDAD');if(!decisions.length)lines.push('Sin decisiones financieras aprobadas.');
 for(const d of decisions)lines.push(`Estado: ${d.action} | Actor: ${d.actor}`,`Fecha: ${d.created_at}`,`Motivo: ${d.reason}`);
 lines.push('Fuentes e identificadores completos disponibles en la API, Excel y JSON.');
 const wrapped=lines.flatMap(s=>{const ascii=s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^\x20-\x7e]/g,'?');return ascii.match(/.{1,95}/g)??[''];});
 const pages:string[][]=[];for(let i=0;i<wrapped.length;i+=43)pages.push(wrapped.slice(i,i+43));
 const objects:Buffer[]=[];const add=(s:string|Buffer)=>objects.push(Buffer.isBuffer(s)?s:Buffer.from(s,'ascii'));
 add('<< /Type /Catalog /Pages 2 0 R >>');add(`<< /Type /Pages /Count ${pages.length} /Kids [${pages.map((_,i)=>`${4+i*2} 0 R`).join(' ')}] >>`);add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
 pages.forEach((ls,i)=>{add(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents ${5+i*2} 0 R >>`);const esc=(s:string)=>s.replace(/[\\()]/g,'\\$&');
 const header='0.063 0.184 0.259 rg 0 770 595 72 re f\n1 1 1 rg BT /F1 16 Tf 1 0 0 1 40 801 Tm (G2EXCHANGE | COSTE DE CAPITAL v2) Tj ET\n0.09 0.19 0.25 rg\n';
 const stream=Buffer.from(header+ls.map((s,n)=>`BT /F1 9 Tf 1 0 0 1 40 ${750-n*15} Tm (${esc(s)}) Tj ET`).join('\n')+`\nBT /F1 9 Tf 1 0 0 1 40 35 Tm (G2EXCHANGE - ${i+1}/${pages.length}) Tj ET\n`,'ascii');add(Buffer.concat([Buffer.from(`<< /Length ${stream.length} >>\nstream\n`),stream,Buffer.from('endstream')]));});
 let result=Buffer.from('%PDF-1.4\n'),offsets=[0];objects.forEach((o,i)=>{offsets.push(result.length);result=Buffer.concat([result,Buffer.from(`${i+1} 0 obj\n`),o,Buffer.from('\nendobj\n')]);});const start=result.length;
 return Buffer.concat([result,Buffer.from(`xref\n0 ${objects.length+1}\n0000000000 65535 f \n`+offsets.slice(1).map(x=>String(x).padStart(10,'0')+' 00000 n ').join('\n')+`\ntrailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${start}\n%%EOF\n`)]);
}
