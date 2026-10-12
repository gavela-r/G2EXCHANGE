import fs from 'node:fs';
import path from 'node:path';
import type { Resultado } from '../tipos';

/** Lightweight standalone PDF writer for Node.js: no Python, no LibreOffice, no PDF dependency. */
function escapePdf(t:string):string {return t.replace(/[\\()]/g,s=>'\\'+s).replace(/[\r\n]+/g,' ');}
function pct(x:number):string{return (x*100).toFixed(2)+'%';}
function num(x:number|null):string{return x===null?'NO DISPONIBLE':x.toFixed(2);}
export function escribirPdf(r:Resultado,outPath:string):void {
  const c:string[]=[];
  const text=(x:number,y:number,s:string,size=11,color:[number,number,number]=[0.12,0.20,0.31],bold=false)=>{
    c.push(`${color.join(' ')} rg BT /${bold?'F2':'F1'} ${size} Tf 1 0 0 1 ${x} ${y} Tm (${escapePdf(s)}) Tj ET`);
  };
  const line=(x:number,y:number,w:number,h:number,color:[number,number,number])=>{c.push(`${color.join(' ')} rg ${x} ${y} ${w} ${h} re f`);};
  line(0,730,595,112,[0.075,0.18,0.30]);
  text(40,791,'G2EXCHANGE  /  VALORACION',22,[1,1,1],true);
  text(40,764,`${r.company_name}   |   ${r.ticker}   |   ${r.valuation_date}`,11,[0.83,0.91,0.98]);
  text(40,701,'COSTE DE CAPITAL POR ESCENARIO',14,[0.075,0.18,0.30],true);
  line(40,670,515,22,[0.91,0.95,0.98]);
  const xs=[47,214,323,432];
  ['CONCEPTO','CONSERVADOR','BASE','OPTIMISTA'].forEach((x,i)=>text(xs[i],677,x,8,[0.075,0.18,0.30],true));
  const rows:[string,(s:Resultado['wacc_scenarios'][number])=>string][]=[
    ['Ke (CAPM)',x=>pct(x.ke)],['Kd bruto',x=>pct(x.kd)],['Kd neto',x=>pct(x.kd_neto)],
    ['Peso patrimonio',x=>pct(x.peso_patrimonio)],['Peso deuda',x=>pct(x.peso_deuda)],
    ['WACC financiero',x=>pct(x.wacc_financiero)],['Prima iliquidez',x=>pct(x.ajustes.prima_iliquidez.value)],
    ['Prima tamano',x=>pct(x.ajustes.prima_tamano.value)],
    ['Prima concentracion',x=>pct(x.ajustes.prima_concentracion_clientes.value)],
    ['Otros ajustes',x=>pct(x.ajustes.otros_ajustes_wacc.value)],
    ['WACC FINAL',x=>pct(x.wacc_ajustado)]
  ];
  rows.forEach(([label,get],idx)=>{
    const y=647-idx*25;
    if(idx%2===0)line(40,y-7,515,24,[0.967,0.975,0.985]);
    if(idx===10)line(40,y-8,515,25,[0.84,0.91,0.98]);
    text(xs[0],y,label,9,[0.10,0.19,0.29],idx===10);
    r.wacc_scenarios.forEach((s,i)=>text(xs[i+1],y,get(s),9,[0.10,0.19,0.29],idx===10));
  });
  const start=330;
  text(40,start,'RESULTADO DEL MODELO',14,[0.075,0.18,0.30],true);
  const vals=r.valuations;
  vals.forEach((x,i)=>{
    const y=start-30-i*43;
    line(40,y-12,515,40,i%2===0?[0.95,0.97,0.985]:[1,1,1]);
    text(48,y+8,x.escenario,9,[0.12,0.23,0.33],true);
    text(215,y+8,`Valor/accion: ${num(x.fair_value)} ${r.currency}`,9);
    text(405,y+8,`WACC: ${pct(x.wacc)}`,9);
    text(215,y-6,`Max compra: ${num(x.max_buy_price)} | ${x.decision}`,8);
  });
  line(40,112,515,55,[0.98,0.95,0.86]);
  text(48,151,`ESTADO: ${r.validation_status}   |   PRIMAS: ${r.premium_methodology}`,10,[0.32,0.24,0.10],true);
  text(48,135,'ERP TOTAL incluye riesgo pais. No se suma otra vez al CAPM.',9,[0.32,0.24,0.10]);
  text(48,120,'Primas automaticas DRAFT requieren revision financiera.',9,[0.32,0.24,0.10]);
  text(40,84,`Run ${r.valuation_run_id}  /  Snapshot ${r.input_snapshot_id}  |  G2EXCHANGE TS v1.5`,9,[0.3,0.4,0.5]);
  text(40,69,'Informe de analisis, no recomendacion automatica de inversion.',8,[0.3,0.4,0.5]);
  const stream=Buffer.from(c.join('\n')+'\n','latin1');
  const objects:Buffer[]=[];
  const add=(s:string|Buffer)=>{objects.push(Buffer.isBuffer(s)?s:Buffer.from(s,'latin1'));};
  add('<< /Type /Catalog /Pages 2 0 R >>');
  add('<< /Type /Pages /Count 1 /Kids [4 0 R] >>');
  add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  add('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R /F2 6 0 R >> >> /Contents 5 0 R >>');
  add(Buffer.concat([Buffer.from(`<< /Length ${stream.length} >>\nstream\n`,'ascii'),stream,Buffer.from('endstream','ascii')]));
  add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
  let buf=Buffer.from('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n','latin1');
  const offsets=[0];
  objects.forEach((obj,i)=>{offsets.push(buf.length);buf=Buffer.concat([buf,Buffer.from(`${i+1} 0 obj\n`,'ascii'),obj,Buffer.from('\nendobj\n','ascii')]);});
  const xref=buf.length;
  const xrefRows=['xref',`0 ${objects.length+1}`,'0000000000 65535 f ',...offsets.slice(1).map(n=>`${String(n).padStart(10,'0')} 00000 n `)];
  buf=Buffer.concat([buf,Buffer.from(xrefRows.join('\n')+`\ntrailer\n<< /Root 1 0 R /Size ${objects.length+1} >>\nstartxref\n${xref}\n%%EOF\n`,'ascii')]);
  fs.mkdirSync(path.dirname(outPath),{recursive:true});fs.writeFileSync(outPath,buf);
}
