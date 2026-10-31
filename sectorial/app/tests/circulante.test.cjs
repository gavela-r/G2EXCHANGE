// Días operativos, NWC y ΔNWC: fórmulas históricas (kpi.cjs) y proyección en el motor sectorial (ambas metodologías).
const {test}=require('node:test'),assert=require('node:assert/strict');
const {kpisForPeriod,kpisForSnapshot}=require('../kpi.cjs'),{crearPlan}=require('../engine/dist/plan'),{fixture}=require('../engine/dist/fixtures');
const ok=value=>({value,validation:'VALIDADO',recordIds:[1]});
const period=(year,f,extra={})=>({fiscalYear:year,periodEnd:year+'-12-31',currency:'USD',basis:'consolidated',norm:'US_GAAP',publication:(year+1)+'-02-01',document:'D'+year,provider:'SEC_EDGAR',fields:Object.fromEntries(Object.entries(f).map(([k,v])=>[k,v===null?{value:null,validation:'PENDIENTE',reason:'sin evidencia'}:ok(v)])),...extra});
const kpi=(p,code)=>kpisForPeriod(p).find(k=>k.code===code);
const close=(a,b,msg)=>assert.ok(Math.abs(a-b)<=1e-9*Math.max(1,Math.abs(b)),`${msg}: ${a} vs ${b}`);
const base={revenue:1000,cogs:600,receivables:150,inventory:120,payables:90,contractAssets:30};

test('Días sobre ventas (metodología G2), saldos de cierre y 365 días',()=>{
 const p=period(2024,base);
 close(kpi(p,'DSO').value,150/1000*365,'DSO');
 close(kpi(p,'DPO_SOBRE_VENTAS').value,90/1000*365,'DPO sobre ventas');
 close(kpi(p,'DIAS_INVENTARIO_SOBRE_VENTAS').value,120/1000*365,'Días inventario sobre ventas');
 close(kpi(p,'CCC_SOBRE_VENTAS').value,kpi(p,'DSO').value+kpi(p,'DIAS_INVENTARIO_SOBRE_VENTAS').value-kpi(p,'DPO_SOBRE_VENTAS').value,'CCC = DSO + DIO − DPO');
 assert.equal(kpi(p,'DSO').unit,'DIAS');
});
test('Variante convencional diferenciada (DIO y DPO sobre coste de ventas)',()=>{
 const p=period(2024,base);
 close(kpi(p,'DIO_SOBRE_COSTE').value,120/600*365,'DIO convencional');
 close(kpi(p,'DPO_SOBRE_COSTE').value,90/600*365,'DPO convencional');
 close(kpi(p,'CCC_CONVENCIONAL').value,150/1000*365+(120-90)/600*365,'CCC convencional');
 assert.notEqual(kpi(p,'DIO_SOBRE_COSTE').value,kpi(p,'DIAS_INVENTARIO_SOBRE_VENTAS').value);
});
test('Activos contractuales sólo en la métrica ampliada (sin doble cómputo)',()=>{
 const p=period(2024,base);
 close(kpi(p,'DIAS_ACTIVOS_OPERATIVOS_AMPLIADOS_SOBRE_VENTAS').value,(120+30)/1000*365,'Ampliada');
 close(kpi(p,'DIAS_INVENTARIO_SOBRE_VENTAS').value,120/1000*365,'El DIO no incluye activos contractuales');
 close(kpi(p,'CAPITAL_CIRCULANTE_OPERATIVO').value,150+120-90,'NWC operativo sin activos contractuales');
});
test('Ausencia y división por cero: NULL, nunca cero',()=>{
 const sinInventario=period(2024,{...base,inventory:null});
 for(const code of ['DIAS_INVENTARIO_SOBRE_VENTAS','CCC_SOBRE_VENTAS','DIO_SOBRE_COSTE','CAPITAL_CIRCULANTE_OPERATIVO']){const k=kpi(sinInventario,code);assert.equal(k.status,'BLOQUEADO_DEPENDENCIA',code);assert.equal(k.value,null);}
 assert.equal(kpi(sinInventario,'DSO').status,'CERTIFICADO');
 const ventasCero=period(2024,{...base,revenue:0});assert.equal(kpi(ventasCero,'DSO').status,'NO_CALCULABLE');assert.equal(kpi(ventasCero,'DSO').value,null);
 const costeCero=period(2024,{...base,cogs:0});const c=kpi(costeCero,'CCC_CONVENCIONAL');assert.equal(c.status,'NO_CALCULABLE');assert.equal(c.cause,'DIVISION_POR_CERO:cogs');
 const ausente=period(2024,base);delete ausente.fields.payables;assert.equal(kpi(ausente,'DPO_SOBRE_VENTAS').inputs.find(i=>i.field==='payables').validation,'AUSENTE');
});
test('DELTA_NWC: actual − anterior, positivo = consumo; primer ejercicio sin saldo inicial; contexto y ejercicios',()=>{
 const p1=period(2023,{...base,receivables:100}),p2=period(2024,base);
 const s=kpisForSnapshot({company:{id:1},asOf:'2025-03-01',inputHash:'x',periods:[p1,p2]});
 const d=y=>s.periods[y].kpis.find(k=>k.code==='DELTA_NWC');
 assert.equal(d(0).status,'BLOQUEADO_DEPENDENCIA');assert.equal(d(0).cause,'SALDO_INICIAL_NO_DISPONIBLE');assert.equal(d(0).value,null);
 assert.equal(d(1).status,'CERTIFICADO');close(d(1).value,(150+120-90)-(100+120-90),'ΔNWC = +50 (consumo de caja)');
 assert.ok(s.definitions.some(x=>x.code==='DELTA_NWC'));assert.equal(s.definitions.find(x=>x.code==='DSO').method,'SOBRE_VENTAS');
 const otraMoneda=kpisForSnapshot({periods:[period(2023,base,{currency:'EUR'}),p2]});assert.equal(otraMoneda.periods[1].kpis.at(-1).cause,'CONTEXTO_CAMBIA_ENTRE_CIERRES');
 const individual=kpisForSnapshot({periods:[period(2023,base,{basis:'standalone'}),p2]});assert.equal(individual.periods[1].kpis.at(-1).cause,'CONTEXTO_CAMBIA_ENTRE_CIERRES');
 const salto=kpisForSnapshot({periods:[period(2022,base),p2]});assert.equal(salto.periods[1].kpis.at(-1).cause,'EJERCICIOS_NO_CONSECUTIVOS');
 const pendiente=kpisForSnapshot({periods:[period(2023,{...base,payables:null}),p2]});assert.equal(pendiente.periods[1].kpis.at(-1).status,'BLOQUEADO_DEPENDENCIA');assert.match(pendiente.periods[1].kpis.at(-1).cause,/^anterior:/);
});

const valores=(p,metodo)=>{const v=p.grafo.evaluar({'control.case':2}),get=(k,i)=>{const e=p.salida[k][i];return typeof e==='number'?e:v.get(e.ref);};return{v,get};};
for(const sector of [4,6,16])test('Motor sector '+sector+' SOBRE_VENTAS: saldos = ingresos × días / 365 y FCFF descuenta ΔNWC una vez',()=>{
 const entrada={...fixture(sector),metodoDiasCirculante:'SOBRE_VENTAS'},p=crearPlan(entrada),{v,get}=valores(p);
 const drv=(k,i)=>v.get('driver.'+k+'.'+i);
 for(let i=0;i<5;i++){
  close(get('receivables',i),get('revenue',i)*drv('dso',i)/365,'Clientes');
  close(get('inventory',i),get('revenue',i)*drv('dio',i)/365,'Existencias sobre ventas');
  close(get('payables',i),get('revenue',i)*drv('dpo',i)/365,'Proveedores sobre ventas');
  close(get('nwc',i),get('inventory',i)+get('receivables',i)+get('contractAssets',i)-get('payables',i)-get('contractLiabilities',i),'NWC');
  if(i)close(get('deltaNwc',i),get('nwc',i)-get('nwc',i-1),'ΔNWC');
 }
 // Sensibilidad: +10 días de cobro elevan ΔNWC del año 1 y reducen el FCFF exactamente en esa cuantía.
 const esc=entrada.escenarios.map(c=>({...c,dso:c.dso.map(x=>x+10)})),q=crearPlan({...entrada,escenarios:esc}),w=valores(q);
 const incrementoNwc=w.get('deltaNwc',0)-get('deltaNwc',0);close(incrementoNwc,w.get('revenue',0)*10/365,'ΔNWC por +10 días');
 close(w.get('fcff',0)-get('fcff',0),-incrementoNwc,'FCFF −ΔNWC (signo y sin doble deducción)');
 const hist=i=>v.get('histdias.dso.'+i),hv=k=>entrada.historicos.slice(-4).map(h=>h.valores[k]);
 for(let i=0;i<4;i++)if(typeof hv('revenue')[i]==='number'&&hv('revenue')[i]!==0)close(hist(i),hv('receivables')[i]/hv('revenue')[i]*365,'DSO histórico mismo denominador');
 assert.match(p.grafo.indice.get('driver.dpo.0').etiqueta,/sobre ventas/);
});
test('Motor: la metodología convencional se conserva y debe distinguirse',()=>{
 const p=crearPlan(fixture(4)),{v,get}=valores(p);
 assert.match(p.grafo.indice.get('driver.dpo.0').etiqueta,/sobre compras/);assert.match(p.grafo.indice.get('driver.dio.0').etiqueta,/coste de ventas/);
 assert.equal(p.grafo.indice.has('histdias.dso.0'),false);
 const ventas=valores(crearPlan({...fixture(4),metodoDiasCirculante:'SOBRE_VENTAS'}));
 close(get('inventory',0)/ventas.get('inventory',0),get('cogs',0)/get('revenue',0)*get('receivables',0)/ventas.get('receivables',0),'Existencias convencionales sobre coste de ventas');
 assert.throws(()=>crearPlan({...fixture(4),metodoDiasCirculante:'OTRO'}),/desconocida/);
});
test('Banca y seguros no usan días de circulante',()=>{for(const s of [13,14]){const p=crearPlan({...fixture(s),metodoDiasCirculante:'SOBRE_VENTAS'});assert.equal(p.grafo.indice.has('driver.dso.0'),false);}});
