import {Entrada,Historico} from './plan';
import {Cohorte} from './activos';
const five=(n:number)=>Array(5).fill(n) as number[];
/** Hipótesis elegidas exclusivamente para prueba. No son benchmarks sectoriales ni emisores reales. */
export function fixture(sector:number,lastYear=2025):Entrada{
 const assets:Cohorte[]=[];
 const asset=(id:string,clase:Cohorte['clase'],neto:number,vida:number,metodo:Cohorte['metodo']='LINEAL',financiacion:Cohorte['financiacion']='APERTURA',adicionAnio:number|null=null):Cohorte=>({id,clase,metodo,neto,residual:0,vida,tasaDecreciente:metodo==='SALDO_DECRECIENTE'?0.3:0,reservas:metodo==='PRODUCCION'?1000:1,fechaServicio:(lastYear-5)+'-01-01',fechaAdquisicion:(lastYear-5)+'-01-01',financiacion,adicionAnio,tipoCapex:financiacion==='CAJA'?'CRECIMIENTO':'NO_APLICABLE'});
 let ppe=250,intangible=50,rou=40,depletion=0,land=60;
 if(sector===2||sector===12){ppe=60;intangible=220;rou=60;land=60;}
 if(sector===3||sector===4||sector===5){ppe=300;intangible=30;rou=30;land=40;}
 if(sector===8||sector===9){ppe=100;intangible=0;rou=0;depletion=300;land=0;}
 if(sector===10||sector===11){ppe=300;intangible=60;rou=20;land=20;}
 if(sector===15){ppe=340;intangible=0;rou=0;land=60;}
 if(sector!==13&&sector!==14){
  assets.push(asset('PPE_apertura','PPE',ppe,sector===6?4:sector===3?5:sector===10?15:8));
  assets.push(asset('INT_apertura','INTANGIBLE',intangible,sector===2?3:5));
  assets.push(asset('ROU_apertura','ROU',rou,5));
  assets.push(asset('AGOT_apertura','AGOTABLE',depletion,5,'PRODUCCION'));
  assets.push(asset('SUELO','NO_DEPRECIABLE',land,0,'NINGUNO'));
  // Tres clases por vintage. Incluso una inversión cero se declara explícitamente en cada escenario.
  for(let y=0;y<5;y++)for(const[k,cl,life,fund]of [['PPE','PPE',sector===6?6:sector===10?20:8,'CAJA'],['INT','INTANGIBLE',sector===2?3:5,'CAJA'],['ROU','ROU',5,'LEASE']] as const){assets.push(asset(k+'_nuevo_'+y,cl,0,life,'LINEAL',fund,y));}
  for(let y=0;y<5;y++){const a=asset('PPE_mant_'+y,'PPE',0,sector===6?6:8,'LINEAL','CAJA',y);a.tipoCapex='MANTENIMIENTO';assets.push(a);}
 }
 const common:Record<string,number[]>={
  volume:[100,104,108,112,116],aftermarketPerUnit:five(.5),retirementRate:five(.1),vehicleProduction:five(1000),share:five(.1),contentPerVehicle:five(10),priceDown:five(.02),volumeGrowth:five(.01),priceMix:five(.02),price:five(10),bookings:five(700),recognition:five(.5),churn:five(.05),expansion:five(.08),newArr:five(80),capacity:[125,130,135,140,145],utilization:five(.8),asp:five(10),openings:five(1),closures:five(0),sameStoreGrowth:five(.03),firstYearRamp:five(.5),production:five(100),reserveAdditions:five(0),gradeRecovery:five(.1),allowedReturn:five(.08),regulatoryDepreciation:five(20),allowedOpex:five(400),eligibleInvestment:five(25),unregulatedRevenue:five(200),netAdds:five(10),arpu:five(5),marketedSales:[900,930,960,990,1020],pipelineGrossSales:five(100),pipelineProbability:five(.25),rdExpense:five(0),area:five(100),rent:five(12),occupancy:five(.9),
  cogsRate:five(sector===15?.15:.55),opexRate:five(sector===15?.1:.2),dio:five(sector===2||sector===10||sector===11||sector===15?0:45),dso:five(30),dpo:five(45),contractAssetRate:five(sector===1?.12:0),contractLiabilityRate:five(sector===2?.18:sector===1?.08:0),debtIssue:five(0),debtRepay:five(5),equityIssue:five(0),payout:five(.25),leasePayment:five(12),leaseRate:five(.04),rf:five(.035),beta:five(1.1),erp:five(.055),kd:five(.045),weightEquity:five(.8),tax:five(.25),terminalG:five(.02),maintenanceCash:five(12),appraisal:[600,610,620,630,640],
  operatingExpense:five(sector===13?20:30),loanGrowth:five(.05),depositGrowth:five(.04),loanYield:five(.065),depositCost:five(.02),provisionRate:five(.008),writeoffs:five(3),fees:five(15),riskWeight:five(.75),otherRiskWeight:five(0),cashYield:five(0),regulatoryTarget:five(sector===13?.12:1.5),regulatoryDeductions:five(5),otherAssets:five(50),wholesaleRate:five(.035),insuranceRevenue:[300,310,320,330,340],claimsIncurred:[200,205,210,215,220],premiumsCash:[320,330,340,350,360],claimsPaid:[190,200,210,220,230],insuranceFinance:five(5),investmentYield:five(.04),netInvestment:five(20),solvencyRequirement:[100,105,110,115,120]
 };
 if(sector===8)common.price=five(10);if(sector===9)common.price=five(100);
 common.leasePayment=five(Math.min(12,(rou+25)/7));
 // Cero ROU con pagos 4 implica interés 0 y principal limitado por saldo disponible.
 const constants:Record<string,number>={installedBase:400,shares:100,nol:0,backlog:1200,arr:900,stores:20,salesPerStore:50,reserves:1000,rab:500,subscribers:180,terminalLiquidation:250,requiredOpening:sector===13?93.2:155};
 const scenarios=[.85,1,1.15].map((factor,caseIndex)=>{
  const c:Record<string,number[]>={};for(const[k,v]of Object.entries(common))c[k]=[...v];
  for(const key of ['vehicleProduction','aftermarketPerUnit','volume','bookings','newArr','capacity','production','marketedSales','pipelineGrossSales','rent','arpu','unregulatedRevenue','fees','insuranceRevenue'])c[key]=common[key].map(v=>v*factor);
  c.rf=five(.035+(1-caseIndex)*.002);c.cogsRate=common.cogsRate.map(x=>x+(1-caseIndex)*.015);c.opexRate=common.opexRate.map(x=>x+(1-caseIndex)*.005);
  c.sameStoreGrowth=five(.02+caseIndex*.01);c.volumeGrowth=five(-.01+caseIndex*.02);c.openings=five(caseIndex);
  for(let y=0;y<5;y++)for(const key of ['PPE','INT','ROU']){
   const id=key+'_nuevo_'+y;c['capex.'+id]=Array.from({length:5},(_,i)=>i===y?(key==='PPE'?13*factor:key==='INT'?(sector===2?25:5)*factor:5):0);
   constants['serviceMonth.'+id]=key==='ROU'?7:1;constants['serviceDay.'+id]=1;constants['serviceYearOffset.'+id]=0;
  }
  for(let y=0;y<5;y++){const id='PPE_mant_'+y;c['capex.'+id]=Array.from({length:5},(_,i)=>i===y?12*factor:0);constants['serviceMonth.'+id]=1;constants['serviceDay.'+id]=1;constants['serviceYearOffset.'+id]=0;}
  c.terminalNOPAT=five(220*factor);c.terminalROIC=five(.12);c.terminalNetIncome=five((sector===13?35:90)*factor);c.terminalROE=five(.12);c.terminalAFFO=five(600*factor);c.terminalEquityGrowthInvestment=five(60*factor);
  return c;
 });
 const historicos:Historico[]=Array.from({length:4},(_,i)=>{const ejercicio=lastYear-3+i;const values:Record<string,number>={revenue:1000,cogs:550,opex:200,ebitda:250,da:60,ebit:190,preTax:180,taxPaid:45,netIncome:135,inventory:70,receivables:80,payables:90,contractAssets:sector===1?120:0,contractLiabilities:sector===2?180:sector===1?80:0,cash:200,debt:80,leaseDebt:rou,PPE:ppe,INTANGIBLE:intangible,ROU:rou,AGOTABLE:depletion,NO_DEPRECIABLE:land,nol:0,dividends:30,cfo:160,cfi:-40,cff:-35,loans:1000,allowance:20,deposits:800,wholesale:100,otherAssets:50,insuranceLiability:750,investments:1000};
  values.fixedAssets=ppe+intangible+rou+depletion+land;
  values.assets=values.fixedAssets+values.inventory+values.receivables+values.contractAssets+values.cash;
  values.equity=values.assets-values.debt-values.leaseDebt-values.payables-values.contractLiabilities;
  if(sector===13){values.assets=values.loans-values.allowance+values.otherAssets+values.cash;values.equity=values.assets-values.deposits-values.wholesale;}
  if(sector===14){values.assets=values.investments+values.otherAssets+values.cash;values.equity=values.assets-values.insuranceLiability;}
  if(sector===13){values.revenue=60.5;values.cogs=0;values.opex=20;values.da=0;values.ebitda=40.5;values.ebit=40.5;values.preTax=40.5;}
  else if(sector===14){values.revenue=140;values.cogs=0;values.opex=30;values.da=0;values.ebitda=110;values.ebit=110;values.preTax=105;}
  else values.preTax=values.ebit-values.debt*.045-values.leaseDebt*.04;
  values.taxPaid=values.preTax*.25;values.netIncome=values.preTax-values.taxPaid;values.dividends=values.netIncome;
  values.cfo=values.netIncome+values.da;values.cfi=-values.da;values.cff=-values.dividends;
  values.capex=values.da;values.capexMaintenance=values.da/2;values.capexGrowth=values.da/2;
  values.liabilitiesEquity=sector===13?values.equity+values.deposits+values.wholesale:sector===14?values.equity+values.insuranceLiability:values.equity+values.debt+values.leaseDebt+values.payables+values.contractLiabilities;
  values.balanceDifference=values.assets-values.liabilitiesEquity;
  return{ejercicio,publicado:(ejercicio+1)+'-03-01',valores:values,fuente:'PRUEBA_SINTETICA / histórico independiente de emisor'};
 });
 return{sector,empresaId:'SYNTHETIC_SECTOR_'+String(sector).padStart(2,'0'),tipo:'PRUEBA_SINTETICA',moneda:'MONEDA_PRUEBA',escala:1,norma:'CONVENCION_PRUEBA_NO_CERTIFICA_IFRS',perimetro:'CONSOLIDADO',asOf:(lastYear+1)+'-10-30',historicos,activos:assets,escenarios:scenarios,constantes:constants,leasing:'FINANCIACION',terminal:sector===8||sector===9?'FINITO':'CONTINUIDAD_ACREDITADA',terminalFuente:'Supuesto sintético explícito; continuidad no autorizada para empresas reales',fechaEventos:'CIERRE_DESPUES_DA'};
}
