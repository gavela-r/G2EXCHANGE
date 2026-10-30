// QA libre y temporal: HyperFormula (GPLv3) y canvas no forman parte del producto.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../..'),xlsx=require('../node_modules/xlsx'),qa=path.join(root,'.verification/capital-qa/node_modules');
const {HyperFormula}=require(path.join(qa,'hyperformula')),canvas=require(path.join(qa,'@napi-rs/canvas'));
const {valorar}=require('../../valuation_engine/dist/src/modelo'),{impactoDcf}=require('../dist-capital/server/src/capital/finanzas'),{simularPrimasAutomaticas}=require('../dist-capital/server/src/capital/automatico'),{exportarExcel}=require('../dist-capital/server/src/capital/reportes');
const fixtures=require('../tests/fixtures/capitalPrimas.cjs'),manifest=require('../../valuation_engine/scripts/manifest.cjs'),manifestHash=manifest.archiveId(manifest.current()),engine=path.join(root,'valuation_engine');
const out=path.join(root,'valuation_engine/research/coste_capital/fase4'),checks=[],renders=[];
fs.mkdirSync(path.join(out,'evidencias'),{recursive:true});const renderDir=path.join(root,'.verification/capital-primas-render');fs.mkdirSync(renderDir,{recursive:true});
function matrix(sheet){const range=xlsx.utils.decode_range(sheet['!ref']),xs=Array.from({length:range.e.r+1},()=>Array(range.e.c+1).fill(null));for(const [a,c]of Object.entries(sheet)){if(a[0]==='!')continue;const p=xlsx.utils.decode_cell(a);xs[p.r][p.c]=c.f?'='+c.f:c.v??null;}return xs;}
function near(a,b){if(typeof b!=='number'){assert.equal(a,b);return;}assert.equal(typeof a,'number',JSON.stringify(a));assert.ok(Math.abs(a-b)<=64*Number.EPSILON*Math.max(1,Math.abs(a),Math.abs(b)),`${a} != ${b}`);}
function verify(book,label,payload){
 const sheets={Primas_auto:matrix(book.Sheets.Primas_auto)};
 for(const name of ['07_WACC','10_RESULTADO'])if(book.Sheets[name]){const original=book.Sheets[name],subset={'!ref':original['!ref']};for(const [a,c]of Object.entries(original))if(!a.startsWith('!')&&c.f?.includes("'Primas_auto'!"))subset[a]=c;sheets[name]=matrix(subset);}
 const hf=HyperFormula.buildFromSheets(sheets,{licenseKey:'gpl-v3',precisionRounding:15,smartRounding:false}),sid=hf.getSheetId('Primas_auto');let compared=0;
 for(let col=1;col<=(payload?.escenarios?.length??1);col++)for(const row of [14,15,16,19,20,21,26,27,30,44,46,49,50,51]){const a=xlsx.utils.encode_cell({col,row:row-1});const cell=book.Sheets.Primas_auto[a];if(!cell)continue;near(hf.getCellValue({sheet:sid,col,row:row-1}),cell.v);compared++;}
 for(const [name,m]of Object.entries(sheets).filter(([n])=>n!=='Primas_auto'))for(const [r,row]of m.entries())for(const [c,v]of row.entries())if(typeof v==='string'&&v.startsWith('=')){const original=book.Sheets[name][xlsx.utils.encode_cell({r,c})];near(hf.getCellValue({sheet:hf.getSheetId(name),row:r,col:c}),original.v);compared++;}
 // Una modificación de la prima operativa debe recalcular Ke/WACC y DCF, sin alterar FCFF.
 if(payload?.escenarios?.[0]?.impacto?.ajustado){const s=payload.escenarios[0],w=payload.fuenteCongelada.output.wacc_scenarios[0],input=payload.fuenteCongelada.input,delta=.001;
  const originalPremium=s.primasAutomaticas.primas[0].ajusteOperativo;
  hf.setCellContents({sheet:sid,row:13,col:1},[[originalPremium+delta]]);
  near(hf.getCellValue({sheet:sid,row:25,col:1}),s.keAjustado+delta);
  const rate=s.waccAjustado+delta*s.pesoPatrimonio,impact=impactoDcf(s.impacto.original,{...input,_waccOriginal:w},rate,s.keAjustado+delta);
  if(s.waccAplicable)near(hf.getCellValue({sheet:sid,row:29,col:1}),rate);
  near(hf.getCellValue({sheet:sid,row:48,col:1}),impact.ajustado.fair_value);
  for(let row=35;row<=39;row++)if(s.waccAplicable)near(hf.getCellValue({sheet:sid,row,col:1}),s.impacto.original.proyeccion_fcff[row-35]);
 }
 checks.push({label,compared,formulaEngine:'HyperFormula 3.5.0 GPLv3, temporal QA',nativeExcel:false,passed:true});hf.destroy();
}
function render(book,sheetName,file,start=1,end=31){
 const s=book.Sheets[sheetName],cols=sheetName==='Primas_auto'?[340,185,185,185]:[180,120,100,120,20,320,20,130,160,130,160,130,160];
 const heights=Array.from({length:end-start+1},(_,n)=>s['!rows']?.[n+start-1]?.hpt?Math.ceil(s['!rows'][n+start-1].hpt*1.15):28),width=cols.reduce((a,b)=>a+b,0),height=heights.reduce((a,b)=>a+b,0)+24,c=canvas.createCanvas(width,height),ctx=c.getContext('2d');ctx.fillStyle='#ffffff';ctx.fillRect(0,0,width,height);ctx.font='14px Arial';
 let y=12;for(let row=start;row<=end;row++){let x=0;for(let col=0;col<cols.length;col++){
  const merge=(s['!merges']??[]).find(m=>row-1>=m.s.r&&row-1<=m.e.r&&col>=m.s.c&&col<=m.e.c);if(merge&&(row-1!==merge.s.r||col!==merge.s.c)){x+=cols[col];continue;}
  const w=merge?cols.slice(merge.s.c,merge.e.c+1).reduce((a,b)=>a+b,0):cols[col],cell=s[xlsx.utils.encode_cell({r:row-1,c:col})],h=heights[row-start];ctx.save();ctx.beginPath();ctx.rect(x,y,w,h);ctx.clip();ctx.fillStyle=row===7?'#173f50':'#ffffff';ctx.fillRect(x,y,w,h);ctx.strokeStyle='#dce5e9';ctx.strokeRect(x,y,w,h);ctx.fillStyle=row===7?'#ffffff':'#173743';ctx.font=(col===0?'bold ':'')+'14px Arial';const text=cell?xlsx.utils.format_cell(cell):'',words=String(text).split(/\s+/);let line='',yy=y+19;for(const word of words){if(ctx.measureText(line+' '+word).width>w-14&&line){ctx.fillText(line,x+7,yy);yy+=18;line=word;}else line+=(line?' ':'')+word;}if(line)ctx.fillText(line,x+7,yy);ctx.restore();x+=cols[col];}y+=heights[row-start];}
 const dest=path.join(renderDir,file+'.png');fs.writeFileSync(dest,c.toBuffer('image/png'));renders.push({sheet:sheetName,file:dest,range:`A${start}:${xlsx.utils.encode_col(cols.length-1)}${end}`,method:'Vista derivada de celdas del XLSX, no captura de Excel nativo'});
}
for(const name of ['AMD_US','TOYOTA_JP','GOGOLOOK_TW']){const book=xlsx.readFile(path.join(out,'salida',name+'.xlsx'),{cellFormula:true,cellNF:true,cellStyles:true}),json=JSON.parse(fs.readFileSync(path.join(out,'salida',name+'.json'),'utf8'));verify(book,name,json.payload);render(book,'Primas_auto',name);if(name==='AMD_US')render(book,'07_WACC','AMD_WACC',18,40);}
for(const code of Array.from({length:16},(_,n)=>String(n+1).padStart(2,'0')))for(const sign of [-1,0,1]){
 const input=JSON.parse(fs.readFileSync(path.join(engine,'ejemplos/DEMO_NO_REAL.json')));Object.assign(input,{company_name:'HYPOTHETICAL_TEST_ONLY',company_id:1,market:'US',template_code:code,valuation_date:'2026-10-29'});delete input.risk_inputs;
 input.wacc_adjustments=Object.fromEntries(['CONSERVATIVE','BASE','OPTIMISTIC'].map(s=>[s,Object.fromEntries(['prima_iliquidez','prima_tamano','prima_concentracion_clientes','otros_ajustes_wacc'].map(f=>[f,{value:0,source:'HYPOTHETICAL_TEST_ONLY',reference_date:input.valuation_date}]))]));input.premium_methodology='SIMULATION_ONLY';input.sector_specific={next_dividends_millions:2000,long_term_dividend_growth:.02,affo_fy0_millions:3000,affo_growth:.02};
 const output=valorar(input,{root:engine}),d=fixtures.data(),m=fixtures.method(),family=({'13':'BANK','14':'INSURANCE','15':'REIT'})[code]??'FCFF';d.empresa.familia=family;m.precioRiesgo.familias=[family];m.coeficientes.lambda=.002*sign;
 if(sign<0)input.cost_of_capital_reference=Object.fromEntries(output.wacc_scenarios.map(w=>[w.escenario,{status:'RECONCILED',ke:w.ke,kd:w.kd,date:input.valuation_date,evidenceHash:fixtures.hash,includedPremiums:[{riesgo:'LIQUIDEZ_BURSATIL',componente:'KE',tasa:.02,evidencia:'HYPOTHETICAL_REFERENCE_ONLY'}]}]));
 const p=simularPrimasAutomaticas(input,output,d,[m],fixtures.hash).primasAutomaticas.primas[0],approved=sign?[{id:'HYPOTHETICAL_APPROVED',factor:m.factor,componente:'KE',tasa:{valor:p.primaCalculada,unidad:'FRACCION_ANUAL'},exposiciones:p.propuesta.exposures,incorporacion:'NO_INCORPORADO',metodo:m,decision:{estado:'APPROVED',actor:'HYPOTHETICAL_TEST_ONLY',fecha:input.valuation_date},evidencia:p.evidencia,referencia:p.propuesta.reference}]:[];
 const result={...simularPrimasAutomaticas(input,output,d,[m],fixtures.hash,approved),fuenteCongelada:{input,output,manifestHash}},book=xlsx.read(exportarExcel(result),{type:'buffer',cellFormula:true,cellNF:true,cellStyles:true});verify(book,`HYPOTHETICAL_${code}_${sign}`,result);
 if(sign===1&&['03','13'].includes(code))render(book,'Primas_auto','HYPOTHETICAL_'+code);
}
const report={at:new Date().toISOString(),checks,renders,total:checks.length,passed:checks.length,limitations:['Artifact Tool no está disponible en el runtime','Verificación independiente de fórmulas con HyperFormula; no se ha controlado Excel nativo','Render derivado de celdas, sin certificación de objetos/gráficos/formato nativo']};fs.writeFileSync(path.join(out,'evidencias/excel-recalculado.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({passed:checks.length,renders:renders.length}));
