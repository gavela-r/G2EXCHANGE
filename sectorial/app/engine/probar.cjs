const {test,after}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {crearPlan,Plan}=require('./dist/plan'),{fixture}=require('./dist/fixtures'),{Grafo,ref,op}=require('./dist/grafo'),{crearCohorte}=require('./dist/activos'),{ventana,leerDato,serial}=require('./dist/datos');
const results={at:new Date().toISOString(),tipo:'PRUEBA_SINTETICA_NO_APROBACION_FINANCIERA',checks:0,sectors:[],features:[]};
const close=(a,b,msg='')=>{results.checks++;assert.equal(typeof a,'number',msg);assert.ok(Math.abs(a-b)<=1e-8*Math.max(1,Math.abs(b)),`${msg}: ${a} vs ${b}`);};
const value=(v,e)=>typeof e==='number'?e:v.get(e.ref),vals=(p,v,k)=>p.salida[k].map(e=>value(v,e));
for(let sector=1;sector<=16;sector++)test('Sector '+sector+': tres escenarios, estados y valoración independientes',()=>{
 const p=crearPlan(fixture(sector));const cases=[];
 for(const scenario of [1,2,3]){
  const v=p.grafo.evaluar({'control.case':scenario}),get=(k,i)=>value(v,p.salida[k][i]);
  const index=scenario-1,factor=[.85,1,1.15][index];
  const firstRevenue={1:(1200+700*factor)*.5,2:(900+900*1.03+80*factor)/2,3:125*factor*.8*10,4:100*factor*10+(400+(400*.9+100*factor))/2*.5*factor,5:1000*factor*.1*10*(1-.02),6:(20+index*.5)*50*(1+.02+index*.01),7:1000*(1-.01+index*.02)*1.02,8:100*factor*10,9:100*factor*.1*100,10:500*.08+20+400+200*factor,11:185*(5*factor)*12,12:900*factor+100*factor*.25,13:65-16-3.5+15*factor,14:300*factor-200+40,15:100*(12*factor)*.9,16:100*factor*10};
  close(get('revenue',0),firstRevenue[sector],'Driver de ingresos independiente');
  const expectedKe=.035+(1-index)*.002+1.1*.055;close(get('ke',0),expectedKe,'CAPM independiente');
  close(get('wacc',0),expectedKe*.8+.045*(1-.25)*.2,'WACC independiente');
  for(let y=0;y<5;y++){
   close(get('balanceDifference',y),0,'Balance sector '+sector);
   close(get('assets',y),get('liabilitiesEquity',y),'Activo y financiación');
   if(sector!==13&&sector!==14){
    close(get('ebitda',y),get('revenue',y)-get('cogs',y)-get('opex',y),'EBITDA');
    close(get('ebit',y),get('ebitda',y)-get('da',y)-get('impair',y)+get('gain',y),'EBIT');
    close(get('nwc',y),get('inventory',y)+get('receivables',y)+get('contractAssets',y)-get('payables',y)-get('contractLiabilities',y),'Perímetro NWC');
    close(get('capex',y),get('capexMaintenance',y)+get('capexGrowth',y),'Mantenimiento + crecimiento');
    close(get('fcff',y),get('cashFcffBridge',y),'FCFF económico vs CFO');
    close(get('cash',y)-(y?get('cash',y-1):200),get('cfo',y)+get('cfi',y)+get('cff',y),'Caja por CF');
   }else{
    close(get('cash',y)-(y?get('cash',y-1):200),get('cfo',y)+get('cff',y),'Caja financiera por CF');
    assert.ok(get('capitalShortfall',y)<=1e-8);results.checks++;
    if(sector===13){const exp=(y?get('required',y-1):fixture(sector).constantes.requiredOpening);close(get('fcfe',y),get('netIncome',y)-(get('required',y)-exp),'Capital anual, no acumulado');}
   }
  }
  const flows=vals(p,v,'valuationFlow'),rates=vals(p,v,'valuationRate');let discount=1,pv=0;for(let y=0;y<5;y++){discount*=1+rates[y];pv+=flows[y]/discount;}
  const terminal=value(v,p.salida.terminal[4]);pv+=terminal/discount;
  const hist=fixture(sector).historicos[3].valores;const expectedEquity=sector===13||sector===14||sector===15?pv:pv+hist.cash-hist.debt-hist.leaseDebt;
  close(value(v,p.salida.price[0]),expectedEquity/100,'Precio por acción calculado independientemente');
  cases.push({scenario,price:value(v,p.salida.price[0]),maxBalance:Math.max(...vals(p,v,'balanceDifference').map(Math.abs)),firstRevenue:get('revenue',0)});
 }
 assert.ok(cases[0].firstRevenue!==cases[2].firstRevenue,'Los escenarios deben cambiar la operación');results.checks++;
 results.sectors.push({sector,cases});
});
const cohort=(changes={},opts={})=>{const p=new Plan(fixture(6));const c={id:'TEST',clase:'PPE',metodo:'LINEAL',neto:150,residual:0,vida:1.5,tasaDecreciente:0,reservas:1000,fechaServicio:'2020-01-01',fechaAdquisicion:'2020-01-01',adicionAnio:null,financiacion:'APERTURA',tipoCapex:'NO_APLICABLE',...changes};const a=crearCohorte(p,c,p.years,opts);const v=p.grafo.evaluar();return{p,a,v};};
test('Cohorte fraccionaria 150 / 1,5: D&A 100 y 50; saldo nunca -50',()=>{const {a,v}=cohort();close(value(v,a.depreciacion[0]),100);close(value(v,a.depreciacion[1]),50);a.cierre.forEach(x=>assert.ok(value(v,x)>=0));results.checks+=5;});
test('Residual 30 conserva saldo 30',()=>{const{a,v}=cohort({residual:30});close(value(v,a.depreciacion[0]),80);close(value(v,a.depreciacion[1]),40);close(value(v,a.cierre[4]),30);});
test('Puesta en servicio a mitad de año y año bisiesto',()=>{const{a,v}=cohort({neto:366,vida:1,fechaServicio:'2028-07-01'});close(value(v,a.depreciacion[0]),0);close(value(v,a.depreciacion[2]),184);close(value(v,a.depreciacion[3]),182);});
test('Deterioro a cierre reduce la base futura sin reescribir D&A anterior',()=>{const{a,v}=cohort({neto:200,vida:4},{deterioros:[50,0,0,0,0]});close(value(v,a.depreciacion[0]),50);close(value(v,a.cierre[0]),100);close(value(v,a.depreciacion[1]),100/3);});
test('Disposición total con residual: ganancia y cese de D&A',()=>{const{a,v}=cohort({neto:200,residual:20,vida:4},{bajas:[1,0,0,0,0],cobros:[170,0,0,0,0]});close(value(v,a.baja[0]),155);close(value(v,a.ganancia[0]),15);close(value(v,a.cierre[1]),0);close(value(v,a.depreciacion[1]),0);});
test('Saldo decreciente: D&A independiente 60,42 y cierre final 0',()=>{const{a,v}=cohort({neto:200,vida:5,metodo:'SALDO_DECRECIENTE',tasaDecreciente:.3});close(value(v,a.depreciacion[0]),60);close(value(v,a.depreciacion[1]),42);close(value(v,a.cierre[4]),0);});
test('Agotamiento: 300 / 1000 unidades; producción 100 => 30',()=>{const{a,v}=cohort({clase:'AGOTABLE',metodo:'PRODUCCION',neto:300},{produccion:[100,100,100,100,100]});close(value(v,a.depreciacion[0]),30);close(value(v,a.cierre[4]),150);});
test('Producción superior a reservas se bloquea',()=>{const{a,v}=cohort({clase:'AGOTABLE',metodo:'PRODUCCION',neto:300,reservas:50},{produccion:[100,0,0,0,0]});assert.equal(value(v,a.depreciacion[0]),'NO_ESTIMABLE');results.checks++;});
test('Suelo no depreciable mantiene su valor',()=>{const{a,v}=cohort({clase:'NO_DEPRECIABLE',metodo:'NINGUNO',neto:300,vida:0});close(value(v,a.cierre[4]),300);close(value(v,a.depreciacion[2]),0);});
test('Vida o apertura ausentes no producen D&A cero',()=>{for(const change of[{neto:null},{vida:null}]){const{a,v}=cohort(change);assert.equal(value(v,a.depreciacion[0]),'NO_ESTIMABLE');results.checks++;}});
test('Vida cero editada se bloquea; no se congela activo positivo',()=>{const{p,a}=cohort();const v=p.grafo.evaluar({'activo.TEST.vida':0});assert.equal(value(v,a.depreciacion[0]),'NO_ESTIMABLE');results.checks++;});
test('Obra en curso: inversión en 2026, puesta en servicio en 2028',()=>{const p=crearPlan(fixture(6)),v=p.grafo.evaluar({'const.serviceYearOffset.PPE_nuevo_0':2});close(v.get('activo.PPE_nuevo_0.da.0'),0);close(v.get('activo.PPE_nuevo_0.da.1'),0);close(v.get('activo.PPE_nuevo_0.da.2'),13/6);});
test('Fechas imposibles, tasas fuera de dominio y activo negativo bloquean',()=>{const p=crearPlan(fixture(6));for(const changes of[{'const.serviceMonth.PPE_nuevo_0':2,'const.serviceDay.PPE_nuevo_0':30},{'case.2.tax.0':1.5},{'case.2.cogsRate.0':-.1},{'activo.SUELO.neto':-1}]){const v=p.grafo.evaluar(changes);assert.equal(value(v,p.salida.price[0]),'NO_ESTIMABLE');results.checks++;}});
test('Historia sintética conserva balance y caja de cada año',()=>{for(let sector=1;sector<=16;sector++){const rows=fixture(sector).historicos;for(const h of rows){close(h.valores.assets,h.valores.liabilitiesEquity);close(h.valores.cfo+h.valores.cfi+h.valores.cff,0);}}});
test('Inputs seleccionados: blanco distinto de cero; blanco no seleccionado no bloquea',()=>{const p=crearPlan(fixture(6));let v=p.grafo.evaluar({'case.1.cogsRate.0':null});assert.equal(typeof value(v,p.salida.price[0]),'number');v=p.grafo.evaluar({'case.2.cogsRate.0':null});assert.equal(value(v,p.salida.price[0]),'NO_ESTIMABLE');v=p.grafo.evaluar({'case.2.cogsRate.0':0});assert.equal(typeof value(v,p.salida.price[0]),'number');results.checks+=3;});
test('NWC inicial ausente bloquea; cero conocido se usa como cero',()=>{const p=crearPlan(fixture(6));let v=p.grafo.evaluar({'hist.inventory.3':null});assert.equal(value(v,p.salida.deltaNwc[0]),'NO_ESTIMABLE');v=p.grafo.evaluar({'hist.inventory.3':0});assert.equal(typeof value(v,p.salida.deltaNwc[0]),'number');results.checks+=2;});
test('Inversión extraordinaria viaja a activos, D&A y FCFF',()=>{const p=crearPlan(fixture(6)),a=p.grafo.evaluar(),b=p.grafo.evaluar({'case.2.capex.PPE_nuevo_0.0':113});close(value(b,p.salida.capex[0])-value(a,p.salida.capex[0]),100);assert.ok(value(b,p.salida.da[0])>value(a,p.salida.da[0]));assert.ok(value(b,p.salida.fcff[0])<value(a,p.salida.fcff[0]));results.checks+=2;});
test('Caja insuficiente bloquea valoración y conserva el déficit visible',()=>{const p=crearPlan(fixture(6)),v=p.grafo.evaluar({'case.2.capex.PPE_nuevo_0.0':100000});assert.ok(value(v,p.salida.cash[0])<0);assert.equal(value(v,p.salida.price[0]),'NO_ESTIMABLE');results.checks+=2;});
test('Terminal: tasa no superior a g bloquea',()=>{const p=crearPlan(fixture(6)),v=p.grafo.evaluar({'case.2.terminalG.4':1});assert.equal(value(v,p.salida.price[0]),'NO_ESTIMABLE');results.checks++;});
test('Ventana 2026 desplaza todo a 2023–2026 / 2027–2031',()=>{assert.deepEqual(ventana([2023,2024,2025,2026]),{historicos:[2023,2024,2025,2026],proyecciones:[2027,2028,2029,2030,2031]});const p=crearPlan(fixture(6,2026)),v=p.grafo.evaluar();close(value(v,p.years[0]),2027);close(value(v,p.years[4]),2031);assert.throws(()=>ventana([2022,2023,2025,2026]));results.checks+=2;});
test('Procedencia: cero válido, NULL, escala, moneda y asOf',()=>{const context={empresaId:'X',moneda:'USD',norma:'US_GAAP',perimetro:'CONSOLIDADO',asOf:'2026-10-30'},f={...context,ejercicio:2025,concepto:'CAPEX',importe:0,escala:1000000,unidad:'USD',documento:'doc sintético',publicado:'2026-03-01',validacion:'VALIDADO'};close(leerDato(f,context),0);assert.equal(leerDato({...f,importe:null},context),null);close(leerDato({...f,importe:2},context),2000000);assert.throws(()=>leerDato({...f,moneda:'JPY'},context));assert.throws(()=>leerDato({...f,publicado:'2026-11-01'},context));assert.throws(()=>serial('2026-02-30'));results.checks+=4;});
test('Salvaguardas: no empresas reales, fechas de eventos no soportadas ni métodos inventados',()=>{assert.throws(()=>crearPlan({...fixture(6),tipo:'EMPRESA'}));assert.throws(()=>crearPlan({...fixture(6),fechaEventos:'MITAD_PERIODO'}));assert.throws(()=>cohort({metodo:'INVENTADO'}));results.checks+=3;});
test('Grafo: ciclo, referencias desconocidas y fórmulas bajo límite Excel',()=>{const g=new Grafo();g.insertar({id:'x',hoja:'X',fila:1,columna:1,unidad:'x',etiqueta:'x',expr:ref('x')});assert.throws(()=>g.evaluar());for(let s=1;s<=16;s++){const p=crearPlan(fixture(s));for(const n of p.grafo.nodos.filter(n=>n.expr))assert.ok(p.grafo.formula(n).length<8192,n.id);}results.checks++;});
after(()=>{fs.mkdirSync(path.join(__dirname,'evidencias'),{recursive:true});fs.writeFileSync(path.join(__dirname,'evidencias/pruebas_ts.json'),JSON.stringify(results,null,2));});
