const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'../..'),engine=path.join(root,'valuation_engine'),xlsx=require('../node_modules/xlsx');
const {valorar}=require('../../valuation_engine/dist/src/modelo'),{simularRun}=require('../dist-capital/server/src/capital/finanzas');
const {exportarExcel,exportarPdf}=require('../dist-capital/server/src/capital/reportes'),{compararCongelado}=require('../dist-capital/server/src/capital/regresion');
const manifest=require('../../valuation_engine/scripts/manifest.cjs'),manifestHash=manifest.archiveId(manifest.current());
const baseline=JSON.parse(fs.readFileSync(path.join(engine,'research/coste_capital/evidencias/compatibilidad_inicial.json')));
const hash=x=>crypto.createHash('sha256').update(x).digest('hex');
const {simularPrimasAutomaticas}=require('../dist-capital/server/src/capital/automatico');
for(const code of Array.from({length:16},(_,i)=>String(i+1).padStart(2,'0')))test(`Plantilla ${code}: simulación, familia financiera, Excel y PDF`,()=>{
 const input=JSON.parse(fs.readFileSync(path.join(engine,'ejemplos/DEMO_NO_REAL.json')));input.template_code=code;input.company_name='EMPRESA FICTICIA PARA PRUEBAS';delete input.risk_inputs;
 input.wacc_adjustments=Object.fromEntries(['CONSERVATIVE','BASE','OPTIMISTIC'].map(s=>[s,Object.fromEntries(['prima_iliquidez','prima_tamano','prima_concentracion_clientes','otros_ajustes_wacc'].map(f=>[f,{value:0,source:'SIMULACION_HIPOTETICA_TEST',reference_date:input.valuation_date}]))]));input.premium_methodology='SIMULATION_ONLY';
 input.sector_specific={next_dividends_millions:2000,long_term_dividend_growth:.02,affo_fy0_millions:3000,affo_growth:.02};
 const output=valorar(input,{root:engine}),before=JSON.stringify(output),s=simularRun(input,output,50,['13','14','15'].includes(code)?0:25);
 assert.equal(JSON.stringify(output),before);assert.equal(s.escenarios.length,3);
 for(const x of s.escenarios){assert.ok(x.keAjustado>x.keBase);assert.equal(x.waccAplicable,!['13','14','15'].includes(code));if(x.impacto.original.fair_value>0)assert.ok(x.impacto.ajustado.fair_value<x.impacto.original.fair_value);}
 const report={...s,fuenteCongelada:{input,output,manifestHash}},book=xlsx.read(exportarExcel(report),{type:'buffer',cellFormula:true});
 assert.ok(book.SheetNames.includes('Capital_v2'));assert.ok(book.SheetNames.includes('14_MOTOR_TS'));assert.equal(book.SheetNames[0],'Capital_v2');
 const sheet=book.Sheets.Capital_v2;
 for(const [index,x]of s.escenarios.entries()){const row=11+index;assert.equal(sheet['L'+row].v,x.waccAjustado);assert.equal(sheet['L'+row].f,`I${row}*D${row}+J${row}*(1-F${row})*E${row}`);assert.equal(sheet['M'+row].v,'NO_ESTIMABLE');}
 assert.equal(exportarPdf(report).subarray(0,5).toString(),'%PDF-');
 const master=fs.readdirSync(path.join(engine,'templates')).find(f=>f.startsWith('Template_'+code+'_'));
 assert.equal(hash(fs.readFileSync(path.join(engine,'templates',master))),baseline.files['valuation_engine/templates/'+master]);
 const d={fecha:input.valuation_date,empresa:{id:input.company_id,codigo_iso:input.market,familia:s.escenarios[0].familia,clasificacionResuelta:true},incorporaciones:[],bursatil:[],capitalizacion:{estado:'CAPITALIZACION_NO_DISPONIBLE'}};
 const automatic=simularPrimasAutomaticas(input,output,d,[],hash(JSON.stringify(input)));
 const autoBook=xlsx.read(exportarExcel({...automatic,fuenteCongelada:{input,output,manifestHash}}),{type:'buffer',cellFormula:true});
 assert.equal(autoBook.SheetNames[0],'Primas_auto');
 for(const [index,x]of automatic.escenarios.entries()){const c='BCD'[index],col=['H','J','L'][index];assert.equal(autoBook.Sheets.Primas_auto[c+'14'].v,0);assert.equal(autoBook.Sheets.Primas_auto[c+'15'].v,'NO_ESTIMABLE');assert.equal(autoBook.Sheets.Primas_auto[c+'16'].v,'NO_ESTIMABLE');assert.equal(autoBook.Sheets.Primas_auto[c+'19'].v,0);assert.equal(autoBook.Sheets.Primas_auto[c+'20'].v,'NO_ESTIMABLE');assert.equal(autoBook.Sheets.Primas_auto[c+'26'].v,x.keBase);assert.equal(autoBook.Sheets['07_WACC'][col+'30'].f,`'Primas_auto'!${c}14`);assert.equal(autoBook.Sheets['07_WACC'][col+'31'].f,`'Primas_auto'!${c}19`);assert.equal(autoBook.Sheets['07_WACC'][col+'35'].v,x.waccAplicable?x.waccBase:'NO_APLICABLE');if(x.impacto.ajustado)assert.equal(autoBook.Sheets['10_RESULTADO'][c+'4'].v,x.impacto.ajustado.fair_value);}
 assert.equal(hash(fs.readFileSync(path.join(engine,'templates',master))),baseline.files['valuation_engine/templates/'+master]);
});
test('Reproducción distingue IEEE-754 de cambios económicos y estructura',()=>{
 const a={rate:.1,text:'ORIGINAL',flows:[100,200]};assert.equal(compararCongelado(a,{...a,rate:.1+Number.EPSILON}).numericallyEquivalent,true);
 assert.equal(compararCongelado(a,{...a,rate:.10001}).numericallyEquivalent,false);
 assert.equal(compararCongelado(a,{...a,text:'CHANGED'}).numericallyEquivalent,false);
 assert.equal(compararCongelado(a,{...a,flows:[100]}).numericallyEquivalent,false);
});
