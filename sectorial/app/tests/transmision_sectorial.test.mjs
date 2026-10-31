// Cada driver sectorial debe transmitirse a los estados (no basta con cambiar etiquetas). Perturba el escenario base
// en el grafo y registra qué salidas cambian. Escribe evidencias/transmision_sectorial.json.
import{test}from'node:test';import assert from'node:assert/strict';import fs from'node:fs';import path from'node:path';
import{root,buildCase}from'./qa_fixtures.mjs';
const GROUPS={ingresos:['revenue'],costes:['cogs','opex','ebitda'],resultado:['ebit','netIncome'],balance:['assets','fixedAssets','receivables','inventory','payables','nwc','loans','deposits','investments','insuranceLiability','equity'],flujos:['cfo','cfi','cff','cash','fcff','valuationFlow','affo'],valoracion:['price'],otros:['nav','reserves','rab','required','backlog','arr','subscribers','installedBase','stores','priceDownFactor','annualRevenue']};
// Drivers cuya ausencia de efecto en precio es metodológica, no un defecto.
const NO_PRICE={8:{reserveAdditions:'Horizonte finito con liquidación explícita; las reservas sólo limitan la producción'},9:{reserveAdditions:'Horizonte finito con liquidación explícita; las reservas sólo limitan la producción'},13:{payout:'FCFE = beneficio − Δcapital requerido; el payout sólo fija el dividendo efectivo, limitado por el capital',equityIssue:'Aportaciones de capital no crean valor en FCFE distribuible'},14:{payout:'FCFE = beneficio − Δcapital requerido; el payout sólo fija el dividendo efectivo, limitado por el capital',equityIssue:'Aportaciones de capital no crean valor en FCFE distribuible'},15:{appraisal:'La tasación externa alimenta el NAV, no el AFFO descontado'}};
// Drivers de coste: deben llegar a costes y valoración, no a ingresos.
const COST={12:{rdExpense:true}};
const matrix=[];
for(let sector=1;sector<=16;sector++)test('Sector '+sector+': los drivers sectoriales se transmiten a los estados',()=>{
 const{model,x}=buildCase(sector);assert.equal(x.result.status,'CALCULADO_PENDIENTE_REVISION');
 const g=x.plan.grafo,out=v=>Object.fromEntries(Object.entries(x.plan.salida).map(([k,e])=>[k,e.map(z=>typeof z==='number'?z:v.get(z.ref))]));
 // Sensibilidad con tasas financieras no nulas (sólo en esta prueba): otros activos ponderados al 100 % y tesorería al 1,5 % (distinto del coste de depósitos para no compensarlo exactamente).
 const start={'control.case':2};for(let i=0;i<5;i++){if(g.indice.has('case.2.otherRiskWeight.'+i))start['case.2.otherRiskWeight.'+i]=1;if(g.indice.has('case.2.cashYield.'+i))start['case.2.cashYield.'+i]=0.015;}
 const base=out(g.evaluar(start));
 for(const driver of model.revenueDrivers){
  const changes={...start};for(let i=0;i<5;i++){const n=g.indice.get('case.2.'+driver+'.'+i);assert.ok(n,'Driver sin nodo de entrada: '+driver);const v=start[n.id]??n.valor;changes[n.id]=v===0?(n.unidad==='tasa'?0.01:1):v*(n.unidad==='tasa'&&v>0.9?0.95:1.05);}
  const after=out(g.evaluar(changes)),moved=k=>after[k]?.some((v,i)=>typeof v==='number'&&typeof base[k][i]==='number'&&Math.abs(v-base[k][i])>1e-9*Math.max(1,Math.abs(base[k][i])));
  const reach=Object.fromEntries(Object.entries(GROUPS).map(([group,keys])=>[group,keys.filter(moved)]));
  matrix.push({sector,model:model.name,driver,...reach,priceExempt:NO_PRICE[sector]?.[driver]??null});
  assert.ok(Object.values(reach).some(a=>a.length),'Sin efecto: '+driver);
  if(!NO_PRICE[sector]?.[driver])assert.ok(reach.valoracion.length,'No llega a la valoración: '+driver);
  if(COST[sector]?.[driver])assert.ok(reach.costes.length,'No llega a costes: '+driver);
  else if(![13,14].includes(sector)&&!NO_PRICE[sector]?.[driver])assert.ok(reach.ingresos.length,'No llega a ingresos: '+driver);
 }
});
test('Evidencia de transmisión',()=>{fs.writeFileSync(path.join(root,'evidencias/transmision_sectorial.json'),JSON.stringify({at:new Date().toISOString(),matrix},null,2));assert.ok(matrix.length>=50);});
