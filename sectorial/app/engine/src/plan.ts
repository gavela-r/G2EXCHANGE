import {Grafo,Expr,Nodo,ref,op,add,sub,mul,div,min,max,pow,iff,ge,gt} from './grafo';
import {Cohorte,Emisor,ResultadoActivo,crearCohorte} from './activos';
import {ventana} from './datos';
import {crearCohorteAvanzada,type CohorteAvanzada,type PeriodoActivo,type ResultadoAvanzado} from './activosAvanzados';
import {crearLedger,type LineaBalance} from './ledger';
import {crearFiscalidad} from './fiscalidad';
export const NOMBRES=['Defensa y aeroespacial','Software y SaaS','Semiconductores y hardware','Industria y fabricación','Automoción y componentes','Retail','Consumo básico','Petróleo y gas','Minería y materiales','Utilities e infraestructura','Telecomunicaciones','Farma y biotecnología','Banca','Seguros','Inmobiliario y REIT','General no financiero'];
export interface Historico {ejercicio:number;publicado:string;valores:Record<string,number|null>;fuente:string;}
export interface Entrada {sector:number;empresaId:string;tipo:'PRUEBA_SINTETICA'|'EMPRESA';moneda:string;escala:number;norma:string;perimetro:string;asOf:string;historicos:Historico[];activos:CohorteAvanzada[];escenarios:Record<string,(number|null)[]>[];constantes:Record<string,number|null>;leasing:'FINANCIACION';terminal:'CONTINUIDAD_ACREDITADA'|'FINITO';terminalFuente:string;fechaEventos:'CIERRE_DESPUES_DA'|'SEGMENTOS_ACT_ACT_FISCAL';periodosFuturos?:PeriodoActivo[];aperturaValoracion?:Record<string,number|null>;contabilidadCompleta?:boolean;metodoDiasCirculante?:'SOBRE_VENTAS'|'CONVENCIONAL';otrasPartidas?:LineaBalance[];evidenciaEntrada?:{version:'MYSQL_SECTORIAL_READONLY_0.2';hash:string;empresaId:string;asOf:string;elegible:boolean};}
export class Plan implements Emisor {
 readonly grafo=new Grafo();readonly filas=new Map<string,number>();readonly siguiente=new Map<string,number>();readonly etiquetas=new Map<string,string>();
 readonly entradaOriginal:Entrada;readonly years:Expr[];readonly salida:Record<string,Expr[]>={};readonly activos:ResultadoActivo[]=[];
 constructor(input:Entrada){
  this.entradaOriginal=input;
  if(input.sector<1||input.sector>16||!Number.isInteger(input.sector))throw Error('Sector inválido');
  if(input.escenarios.length!==3)throw Error('Se requieren tres escenarios');
  if(input.leasing!=='FINANCIACION')throw Error('Política de leasing no implementada');
  if(!['CIERRE_DESPUES_DA','SEGMENTOS_ACT_ACT_FISCAL'].includes(input.fechaEventos))throw Error('Convención temporal desconocida');
  if(input.fechaEventos==='SEGMENTOS_ACT_ACT_FISCAL'&&input.periodosFuturos?.length!==5)throw Error('Calendario fiscal avanzado obligatorio');
  if(!input.terminalFuente)throw Error('Política terminal sin fuente');
  if(input.tipo!=='PRUEBA_SINTETICA'&&(!input.evidenciaEntrada||input.evidenciaEntrada.version!=='MYSQL_SECTORIAL_READONLY_0.2'||!/^[a-f0-9]{64}$/.test(input.evidenciaEntrada.hash)||input.evidenciaEntrada.empresaId!==input.empresaId||input.evidenciaEntrada.asOf!==input.asOf))throw Error('Uso empresarial bloqueado: entrada del adaptador y evidencia por partida obligatorias');
  if(input.historicos.some(h=>!h.fuente||h.publicado.slice(0,10)>input.asOf))throw Error('Historia sin fuente o con anticipación');
  if(new Set(input.activos.map(a=>a.id)).size!==input.activos.length)throw Error('Cohortes duplicadas');
  const periodos=ventana(input.historicos.map(h=>h.ejercicio));
  this.grafo.insertar({id:'control.lastYear',hoja:'S_Control',fila:5,columna:2,etiqueta:'Último cierre completo de la fuente',unidad:'año',expr:ref('year.h.3')});
  this.grafo.insertar({id:'control.case',hoja:'S_Control',fila:6,columna:2,etiqueta:'Escenario (1 Conservador, 2 Base, 3 Optimista)',unidad:'selector',valor:2});
  for(let i=0;i<4;i++)this.grafo.insertar({id:'year.h.'+i,hoja:'S_Historico',fila:5,columna:9+i,etiqueta:'Ejercicio histórico acreditado',unidad:'año',valor:periodos.historicos[i]});
  this.years=this.serie('S_Modelo','year','Ejercicio proyectado',Array.from({length:5},(_,i)=>input.periodosFuturos?Number(input.periodosFuturos[i].end.slice(0,4)):add(ref('control.lastYear'),i+1)),'año');
  for(const key of new Set(input.historicos.flatMap(h=>Object.keys(h.valores))))this.hist(key);
 }
 fila(hoja:string,id:string,label:string){const key=hoja+'|'+id;if(!this.filas.has(key)){const r=this.siguiente.get(hoja)??8;this.filas.set(key,r);this.siguiente.set(hoja,r+1);this.etiquetas.set(key,label);}return this.filas.get(key)!;}
 celda(hoja:string,id:string,label:string,indice:number,expr:Expr,unidad='importe'):Expr{return this.grafo.insertar({id:id+'.'+indice,hoja,fila:this.fila(hoja,id,label),columna:13+indice,etiqueta:label,unidad,expr});}
 serie(hoja:string,id:string,label:string,expr:Expr[],unidad='importe'):Expr[]{return expr.map((x,i)=>this.celda(hoja,id,label,i,x,unidad));}
 entrada(hoja:string,id:string,label:string,values:(number|null)[],unidad='importe'):Expr[]{if(values.length!==5)throw Error('Cinco períodos requeridos: '+id);const row=this.fila(hoja,id,label);return values.map((value,i)=>this.grafo.insertar({id:id+'.'+i,hoja,fila:row,columna:13+i,etiqueta:label,unidad,valor:value,fuente:this.entradaOriginal.tipo==='PRUEBA_SINTETICA'?'Caso sintético; no son cifras de una empresa':'Hipótesis explícita; requiere evidencia antes de producción'}));}
 constante(id:string,label:string,value:number|null,unidad='importe'):Expr {const row=this.fila('S_Inputs','const.'+id,label);return this.grafo.insertar({id,hoja:'S_Inputs',fila:row,columna:13,etiqueta:label,unidad,valor:value,fuente:this.entradaOriginal.tipo});}
 hist(key:string,label=key):Expr[]{if(this.grafo.indice.has('hist.'+key+'.0'))return Array.from({length:4},(_,i)=>ref('hist.'+key+'.'+i));const h=[...this.entradaOriginal.historicos].sort((a,b)=>a.ejercicio-b.ejercicio).slice(-4);const row=this.fila('S_Historico','hist.'+key,label);return h.map((record,i)=>this.grafo.insertar({id:'hist.'+key+'.'+i,hoja:'S_Historico',fila:row,columna:9+i,etiqueta:label,unidad:'importe',valor:record.valores[key]??null,fuente:record.fuente}));}
 base(key:string,label=key):Expr[]{const values=this.hist(key,label);if(!this.entradaOriginal.aperturaValoracion)return values;const id='apertura.'+key;values[3]=this.grafo.indice.has(id)?ref(id):this.constExprInput('S_Apertura',id,label,this.entradaOriginal.aperturaValoracion[key]??null);return values;}
 constExprInput(sheet:string,id:string,label:string,value:number|null):Expr {const row=this.fila(sheet,id,label);return this.grafo.insertar({id,hoja:sheet,fila:row,columna:13,etiqueta:label,unidad:'importe',valor:value,fuente:'Puente de apertura documentado a '+this.entradaOriginal.asOf});}
 yearFraction(i:number):Expr{return this.entradaOriginal.periodosFuturos?this.c('yearFraction.'+i,'Fracción anual fiscal '+(i+1),'ratio'):1;}
 driver(key:string,label=key,unit='importe'):Expr[]{
  const id='driver.'+key;if(this.grafo.indice.has(id+'.0'))return Array.from({length:5},(_,i)=>ref(id+'.'+i));
  const cases=this.entradaOriginal.escenarios.map((c,i)=>this.entrada('S_Inputs','case.'+(i+1)+'.'+key,label+' — '+['Conservador','Base','Optimista'][i],c[key]??[null,null,null,null,null],unit));
  const proportions=new Set(['share','retirementRate','priceDown','recognition','churn','pipelineProbability','utilization','firstYearRamp','gradeRecovery','occupancy','cogsRate','opexRate','tax','weightEquity','payout']);
  const positive=new Set(['rdExpense','riskWeight','otherRiskWeight','vehicleProduction','contentPerVehicle','aftermarketPerUnit','volume','price','bookings','newArr','capacity','asp','openings','closures','production','reserveAdditions','allowedOpex','eligibleInvestment','unregulatedRevenue','arpu','marketedSales','pipelineGrossSales','area','rent','dio','dso','dpo','debtIssue','debtRepay','equityIssue','leasePayment','operatingExpense','writeoffs','otherAssets','insuranceRevenue','claimsIncurred','premiumsCash','claimsPaid','insuranceFinance','solvencyRequirement','regulatoryDeductions']);
  const expressions=Array.from({length:5},(_,i)=>{
   const x=op('CHOOSE',ref('control.case'),cases[0][i],cases[1][i],cases[2][i]);
   if(proportions.has(key))return iff(ge(x,0),iff(ge(1,x),x,div(1,0)),div(1,0));
   if(positive.has(key)||key.startsWith('capex.'))return iff(ge(x,0),x,div(1,0));
   return x;
  });
  return this.serie('S_Inputs',id,label+' — selección activa',expressions,unit);
 }
 c(key:string,label=key,unit='importe'):Expr {const id='const.'+key;if(this.grafo.indice.has(id))return ref(id);return this.constante(id,label,this.entradaOriginal.constantes[key]??null,unit);}
 build(){if(this.entradaOriginal.sector===13)this.banca();else if(this.entradaOriginal.sector===14)this.seguros();else this.noFinanciero();return this;}
 serieModelo(id:string,label:string,x:Expr[],unit='importe'){const a=this.serie('S_Modelo','modelo.'+id,label,x,unit);this.salida[id]=a;return a;}
 revenue():Expr[]{
  const sector=this.entradaOriginal.sector,d=(k:string,label=k,unit='importe')=>this.driver(k,label,unit),sm=(k:string,l:string,x:Expr[],u='importe')=>this.serieModelo(k,l,x,u);
  if(sector===1){const books=d('bookings','Contratos nuevos'),rate=d('recognition','Fracción de cartera reconocida','tasa'),back:Expr[]=[],rev:Expr[]=[];
   for(let i=0;i<5;i++){const available=add(i?back[i-1]:this.c('backlog','Cartera inicial'),books[i]);rev[i]=this.celda('S_Modelo','modelo.revenue','Ingresos por contratos',i,mul(available,rate[i]));back[i]=this.celda('S_Modelo','modelo.backlog','Cartera al cierre',i,sub(available,rev[i]));}this.salida.backlog=back;this.salida.revenue=rev;return rev;}
  if(sector===2){const churn=d('churn','Churn anual','tasa'),exp=d('expansion','Expansión ARR','tasa'),newarr=d('newArr','ARR nuevo'),arr:Expr[]=[],rev:Expr[]=[];
   for(let i=0;i<5;i++){const start=i?arr[i-1]:this.c('arr','ARR inicial');arr[i]=this.celda('S_Modelo','modelo.arr','ARR al cierre',i,add(mul(start,pow(add(1,sub(exp[i],churn[i])),this.yearFraction(i))),newarr[i]));rev[i]=this.celda('S_Modelo','modelo.revenue','Ingreso reconocido (ARR medio explícito)',i,mul(div(add(start,arr[i]),2),this.yearFraction(i)));}this.salida.arr=arr;this.salida.revenue=rev;return rev;}
  if(sector===3){const capacity=d('capacity','Capacidad anual disponible','unidades'),util=d('utilization','Utilización','tasa'),price=d('asp','ASP');return sm('revenue','Ingresos capacidad × utilización × ASP × fracción temporal',capacity.map((c,i)=>mul(c,util[i],price[i],this.yearFraction(i))));}
  if(sector===6){const openings=d('openings','Aperturas de tiendas','unidades'),closures=d('closures','Cierres de tiendas','unidades'),growth=d('sameStoreGrowth','Crecimiento comparable','tasa'),ramp=d('firstYearRamp','Fracción productiva aperturas','tasa');let stores:Expr=this.c('stores','Tiendas iniciales','unidades'),sales:Expr=this.c('salesPerStore','Venta por tienda inicial');const rev:Expr[]=[],counts:Expr[]=[];
   for(let i=0;i<5;i++){sales=this.celda('S_Modelo','modelo.salesPerStore','Ventas anuales por tienda madura',i,mul(sales,pow(add(1,growth[i]),this.yearFraction(i))));const surviving=sub(stores,closures[i]);rev[i]=this.celda('S_Modelo','modelo.revenue','Ventas tiendas maduras y aperturas',i,mul(add(surviving,mul(openings[i],ramp[i])),sales,this.yearFraction(i)));stores=this.celda('S_Modelo','modelo.stores','Tiendas al cierre',i,add(surviving,openings[i]));counts.push(stores);}this.salida.stores=counts;this.salida.revenue=rev;return rev;}
  if(sector===8||sector===9){const production=d('production',sector===8?'Producción vendida':'Toneladas procesadas','unidades'),price=d('price','Precio realizado'),res:Expr[]=[],repl=d('reserveAdditions','Reservas incorporadas','unidades');
   for(let i=0;i<5;i++){const available=add(i?res[i-1]:this.c('reserves','Reservas iniciales','unidades'),repl[i]);res[i]=this.celda('S_Modelo','modelo.reserves','Reservas al cierre',i,iff(ge(available,production[i]),sub(available,production[i]),div(1,0)));}this.salida.reserves=res;
   const grade=sector===9?d('gradeRecovery','Ley × recuperación','tasa'):production.map(()=>1);return sm('revenue','Ingresos por producción y precio',production.map((q,i)=>iff(ge(res[i],0),mul(q,grade[i],price[i]),div(1,0))));}
  if(sector===10){const returns=d('allowedReturn','Retorno regulado','tasa'),dep=d('regulatoryDepreciation','Depreciación regulatoria'),opex=d('allowedOpex','Costes recuperables'),invest=d('eligibleInvestment','Inversión admitida en RAB'),other=d('unregulatedRevenue','Ingresos no regulados'),rab:Expr[]=[],rev:Expr[]=[];
   for(let i=0;i<5;i++){const opening=i?rab[i-1]:this.c('rab','RAB inicial');rev[i]=this.celda('S_Modelo','modelo.revenue','Ingreso regulado + no regulado',i,add(mul(opening,returns[i],this.yearFraction(i)),dep[i],opex[i],other[i]));rab[i]=this.celda('S_Modelo','modelo.rab','Base regulatoria al cierre',i,sub(add(opening,invest[i]),dep[i]));}this.salida.rab=rab;this.salida.revenue=rev;return rev;}
  if(sector===11){const adds=d('netAdds','Altas netas abonados','unidades'),arpu=d('arpu','ARPU mensual'),subs:Expr[]=[],rev:Expr[]=[];
   for(let i=0;i<5;i++){const start=i?subs[i-1]:this.c('subscribers','Abonados iniciales','unidades');subs[i]=this.celda('S_Modelo','modelo.subscribers','Abonados al cierre',i,add(start,adds[i]));rev[i]=this.celda('S_Modelo','modelo.revenue','Ingreso por abonados medios y ARPU mensual',i,mul(div(add(start,subs[i]),2),arpu[i],12,this.yearFraction(i)));}this.salida.subscribers=subs;this.salida.revenue=rev;return rev;}
  if(sector===12){const marketed=d('marketedSales','Ventas productos comercializados'),pipeline=d('pipelineGrossSales','Ventas potenciales pipeline'),prob=d('pipelineProbability','Probabilidad explícita por escenario','tasa');return sm('revenue','Ventas comercializadas + pipeline ponderado',marketed.map((r,i)=>add(r,mul(pipeline[i],prob[i]))));}
  if(sector===15){const area=d('area','Superficie alquilable','unidades'),rent=d('rent','Renta anual por unidad'),occ=d('occupancy','Ocupación','tasa');return sm('revenue','Rentas brutas × ocupación × fracción temporal',area.map((a,i)=>mul(a,rent[i],occ[i],this.yearFraction(i))));}
  if(sector===4){// Equipo nuevo + posventa sobre base instalada (altas = unidades vendidas; bajas por tasa de retiro).
   const volumes=d('volume','Unidades de equipo vendidas','unidades'),prices=d('price','Precio realizado por unidad'),service=d('aftermarketPerUnit','Ingreso anual de posventa por unidad instalada'),retire=d('retirementRate','Tasa anual de retiro de la base instalada','tasa'),installed:Expr[]=[],after:Expr[]=[],rev:Expr[]=[];
   for(let i=0;i<5;i++){const start=i?installed[i-1]:this.c('installedBase','Base instalada inicial','unidades');installed[i]=this.celda('S_Modelo','modelo.installedBase','Base instalada al cierre',i,add(sub(start,mul(start,retire[i],this.yearFraction(i))),volumes[i]),'unidades');after[i]=this.celda('S_Modelo','modelo.aftermarketRevenue','Ingresos de posventa (base media × ingreso unitario)',i,mul(div(add(start,installed[i]),2),service[i],this.yearFraction(i)));rev[i]=this.celda('S_Modelo','modelo.revenue','Ingresos de equipo + posventa',i,add(mul(volumes[i],prices[i]),after[i]));}
   this.salida.installedBase=installed;this.salida.aftermarketRevenue=after;this.salida.revenue=rev;return rev;}
  if(sector===5){// Proveedor: producción del mercado servido × cuota × contenido, con reducciones de precio contractuales acumuladas.
   const production=d('vehicleProduction','Producción de vehículos del mercado servido','unidades'),share=d('share','Cuota de contenido adjudicada','tasa'),content=d('contentPerVehicle','Contenido por vehículo antes de reducciones'),priceDown=d('priceDown','Reducción anual de precio contractual','tasa'),factor:Expr[]=[],rev:Expr[]=[];
   for(let i=0;i<5;i++){factor[i]=this.celda('S_Modelo','modelo.priceDownFactor','Factor acumulado de reducciones de precio',i,mul(i?factor[i-1]:1,pow(sub(1,priceDown[i]),this.yearFraction(i))),'ratio');rev[i]=this.celda('S_Modelo','modelo.revenue','Ingresos producción × cuota × contenido neto',i,mul(production[i],share[i],content[i],factor[i]));}
   this.salida.priceDownFactor=factor;this.salida.revenue=rev;return rev;}
  if(sector===7){// Consumo básico: ingresos anualizados = base acreditada × (1 + volumen) × (1 + precio/mix); período parcial por fracción fiscal.
   const volume=d('volumeGrowth','Crecimiento orgánico de volumen','tasa'),mix=d('priceMix','Efecto precio/mix','tasa'),annual:Expr[]=[],rev:Expr[]=[],base=this.hist('revenue')[3];
   for(let i=0;i<5;i++){annual[i]=this.celda('S_Modelo','modelo.annualRevenue','Ingresos anualizados (volumen × precio/mix)',i,iff(gt(add(1,volume[i]),0),iff(gt(add(1,mix[i]),0),mul(i?annual[i-1]:base,add(1,volume[i]),add(1,mix[i])),div(1,0)),div(1,0)));rev[i]=this.celda('S_Modelo','modelo.revenue','Ingresos del período',i,mul(annual[i],this.yearFraction(i)));}
   this.salida.annualRevenue=annual;this.salida.revenue=rev;return rev;}
  const volumes=d('volume','Volumen vendido','unidades'),prices=d('price','Precio realizado');return sm('revenue','Ingresos volumen × precio',volumes.map((v,i)=>mul(v,prices[i])));
 }
 buildActivos(){
  const production=(this.entradaOriginal.sector===8||this.entradaOriginal.sector===9)?this.driver('production','Producción','unidades'):undefined;
  for(const c of this.entradaOriginal.activos){
   if(this.entradaOriginal.fechaEventos==='SEGMENTOS_ACT_ACT_FISCAL'){
    let additions:Expr[]|undefined,service:Expr|undefined;
    if(c.adicionAnio!==null){additions=this.driver('capex.'+c.id,'Inversión '+c.id).map((x,i)=>i===c.adicionAnio?x:0);}
    this.activos.push(crearCohorteAvanzada(this,c,this.entradaOriginal.periodosFuturos!,{adicion:additions,servicio:service,produccion:c.clase==='AGOTABLE'?production:undefined,reservasAdiciones:c.clase==='AGOTABLE'&&production?this.driver('reserveAdditions','Reservas incorporadas','unidades'):undefined}));continue;
   }
   if(c.adicionAnio===null)this.activos.push(crearCohorte(this,c,this.years,{produccion:c.clase==='AGOTABLE'?production:undefined,reservasAdiciones:c.clase==='AGOTABLE'&&production?this.driver('reserveAdditions','Reservas incorporadas','unidades'):undefined}));
   else {const additions=this.driver('capex.'+c.id,'Inversión '+c.id),offset=this.c('serviceYearOffset.'+c.id,'Años hasta puesta en servicio '+c.id,'años'),month=this.c('serviceMonth.'+c.id,'Mes de puesta en servicio '+c.id,'mes'),day=this.c('serviceDay.'+c.id,'Día de puesta en servicio '+c.id,'día');
    const year=add(this.years[c.adicionAnio],offset),date=op('DATE',year,month,day),servicio=iff(mul(op('=',op('YEAR',date),year),op('=',op('MONTH',date),month),op('=',op('DAY',date),day)),date,div(1,0));
    const serviceNode=this.constExpr('S_Inputs','activo.'+c.id+'.serviceDate','Fecha de servicio '+c.id,iff(ge(offset,0),servicio,div(1,0)),'fecha');
    this.activos.push(crearCohorte(this,c,this.years,{adicion:additions.map((x,i)=>i===c.adicionAnio?x:0),servicio:serviceNode,produccion:c.clase==='AGOTABLE'?production:undefined}));}
  }
 }
 agregadoActivo(key:keyof ResultadoActivo,filter?:(a:ResultadoActivo)=>boolean):Expr[]{return this.years.map((_,i)=>add(...this.activos.filter(a=>!filter||filter(a)).map(a=>(a[key] as Expr[])[i])));}
 capital(){
  const d=(k:string,l:string)=>this.driver(k,l,'tasa'),rf=d('rf','Tipo libre de riesgo'),beta=d('beta','Beta apalancada'),erp=d('erp','Prima de mercado'),kd=d('kd','Coste deuda antes de impuestos'),we=d('weightEquity','Peso de patrimonio'),tax=d('tax','Tipo impositivo');
  const ke=this.serie('S_Capital','capital.ke','Ke base = Rf + beta × ERP',rf.map((r,i)=>add(r,mul(beta[i],erp[i]))),'tasa');
  const wd=this.serie('S_Capital','capital.wd','Peso deuda',we.map(w=>sub(1,w)),'tasa');
  const wacc=this.serie('S_Capital','capital.wacc','WACC por componentes',ke.map((k,i)=>iff(ge(we[i],0),iff(ge(1,we[i]),add(mul(k,we[i]),mul(kd[i],sub(1,tax[i]),wd[i])),div(1,0)),div(1,0))),'tasa');
  this.salida.ke=ke;this.salida.kd=kd;this.salida.wacc=wacc;return{ke,kd,we,wd,tax,wacc};
 }
 noFinanciero(){
  const sm=(id:string,label:string,x:Expr[],unit='importe')=>this.serieModelo(id,label,x,unit),d=(k:string,l=k,u='importe')=>this.driver(k,l,u);
  const revenue=this.revenue(),{ke,kd,tax,wacc}=this.capital();this.buildActivos();
  const complete=this.entradaOriginal.contabilidadCompleta===true;
  const ledger=complete?crearLedger(this,this.entradaOriginal.otrasPartidas??[],this.years):null;
  const fiscal=complete?crearFiscalidad(this,this.years.map((_,i)=>ref('modelo.preTax.'+i)),tax,this.c('nol','Pérdidas fiscales acreditadas de apertura')):null;
  const da=sm('da','D&A y agotamiento',this.agregadoActivo('depreciacion')),imp=sm('impair','Deterioro no monetario',this.agregadoActivo('deterioro')),gain=sm('gain','Resultado de venta de activos',this.agregadoActivo('ganancia'));
  const capex=sm('capex','CapEx pagado',this.agregadoActivo('inversion')),leaseNew=sm('leaseNew','Altas ROU no monetarias',this.agregadoActivo('lease')),disposal=sm('disposal','Cobros por bajas',this.agregadoActivo('cobros'));
  const capexMaintenance=sm('capexMaintenance','CapEx pagado de mantenimiento',this.agregadoActivo('inversion',a=>a.tipoCapex==='MANTENIMIENTO'));
  sm('capexGrowth','CapEx pagado de crecimiento',this.agregadoActivo('inversion',a=>a.tipoCapex==='CRECIMIENTO'));
  for(const clase of ['PPE','INTANGIBLE','ROU','AGOTABLE','NO_DEPRECIABLE'])sm('assets.'+clase,'Saldo '+clase,this.agregadoActivo('cierre',a=>a.clase===clase));
  const totalAssets=sm('fixedAssets','Activos no corrientes por cohortes',this.agregadoActivo('cierre'));
  const cogsRate=d('cogsRate','Coste directo / ventas','tasa'),opexRate=d('opexRate','Gastos operativos / ventas','tasa');
  const cogs=sm('cogs','Coste de ventas (positivo)',revenue.map((r,i)=>mul(r,cogsRate[i]))),rd=this.entradaOriginal.sector===12?this.driver('rdExpense','I+D reconocida como gasto (no capitalizada)'):null,opex=sm('opex',rd?'Gasto operativo sin D&A, incluida I+D':'Gasto operativo sin D&A',revenue.map((r,i)=>rd?add(mul(r,opexRate[i]),rd[i]):mul(r,opexRate[i])));if(rd)this.salida.rdExpense=rd;
  const ebitda=sm('ebitda','EBITDA',revenue.map((r,i)=>add(sub(sub(r,cogs[i]),opex[i]),ledger?.operatingProfit[i]??0))),ebit=sm('ebit','EBIT después de deterioro y bajas',ebitda.map((v,i)=>add(sub(sub(v,da[i]),imp[i]),gain[i])));
  // Días de circulante. SOBRE_VENTAS (metodología G2): DSO, DIO y DPO sobre ingresos, base 365 × fracción anual.
  // CONVENCIONAL: DSO sobre ingresos, DIO sobre coste de ventas y DPO sobre compras, base días del período.
  // Saldos de cierre en ambos casos; los históricos se muestran con el mismo denominador que la proyección.
  const ventas=this.entradaOriginal.metodoDiasCirculante==='SOBRE_VENTAS';
  if(this.entradaOriginal.metodoDiasCirculante!==undefined&&!['SOBRE_VENTAS','CONVENCIONAL'].includes(this.entradaOriginal.metodoDiasCirculante))throw Error('Metodología de días de circulante desconocida');
  const dio=d('dio',ventas?'Días de inventario sobre ventas':'Días de inventario sobre coste de ventas','días'),dso=d('dso','Días de cobro sobre ventas','días'),dpo=d('dpo',ventas?'Días de pago sobre ventas':'Días de pago sobre compras','días'),ca=d('contractAssetRate','Activos contractuales / ingresos','tasa'),cl=d('contractLiabilityRate','Pasivos contractuales / ingresos','tasa');
  const days=this.years.map((y,i)=>ventas?mul(365,this.yearFraction(i)):this.entradaOriginal.periodosFuturos?this.c('periodDays.'+i,'Días del ejercicio fiscal '+(i+1),'días'):sub(op('DATE',add(y,1),1,1),op('DATE',y,1,1)));
  const inventory=sm('inventory','Existencias',(ventas?revenue:cogs).map((c,i)=>div(mul(c,dio[i]),days[i]))),ar=sm('receivables','Cuentas a cobrar',revenue.map((r,i)=>div(mul(r,dso[i]),days[i])));
  const hInventory=this.base('inventory','Existencias de apertura'),hAR=this.base('receivables','Clientes de apertura'),hAP=this.base('payables','Proveedores de apertura'),hCA=this.base('contractAssets','Activos contractuales de apertura'),hCL=this.base('contractLiabilities','Pasivos contractuales de apertura');
  if(ventas){const hRev=this.hist('revenue','Ingresos'),hist=(id:string,label:string,num:Expr[])=>{const row=this.fila('S_Historico','histdias.'+id,label);hRev.forEach((r,i)=>this.grafo.insertar({id:'histdias.'+id+'.'+i,hoja:'S_Historico',fila:row,columna:9+i,etiqueta:label,unidad:'días',expr:div(mul(num[i],365),r)}));};
   const hInv=this.hist('inventory'),hRec=this.hist('receivables'),hPay=this.hist('payables');
   hist('dso','DSO histórico = cuentas a cobrar / ventas × 365 (cierre)',hRec);hist('dio','Días de inventario sobre ventas históricos (cierre)',hInv);hist('dpo','DPO sobre ventas histórico (cierre)',hPay);hist('ccc','CCC sobre ventas histórico = DSO + DIO − DPO',hRec.map((x,i)=>sub(add(x,hInv[i]),hPay[i])));}
  const purchases=sm('purchases','Compras = COGS + variación de existencias',cogs.map((c,i)=>add(c,sub(inventory[i],i?inventory[i-1]:hInventory[3]))));
  const ap=sm('payables','Cuentas a pagar',(ventas?revenue:purchases).map((p,i)=>div(mul(p,dpo[i]),days[i]))),contractAssets=sm('contractAssets','Activos contractuales',revenue.map((r,i)=>mul(r,ca[i]))),contractLiabilities=sm('contractLiabilities','Pasivos contractuales / diferidos',revenue.map((r,i)=>mul(r,cl[i])));
  const nwc=sm('nwc','NWC operativo',inventory.map((v,i)=>sub(sub(add(v,ar[i],contractAssets[i]),ap[i]),contractLiabilities[i])));
  const openingNWC=sub(sub(add(hInventory[3],hAR[3],hCA[3]),hAP[3]),hCL[3]);
  const deltaNWC=sm('deltaNwc','Inversión / liberación NWC',nwc.map((n,i)=>sub(n,i?nwc[i-1]:openingNWC)));
  const histCash=this.base('cash','Tesorería de apertura'),histDebt=this.base('debt','Deuda financiera de apertura'),histLease=this.base('leaseDebt','Pasivo de arrendamiento de apertura'),histEquity=this.base('equity','Patrimonio de apertura');
  const newDebt=d('debtIssue','Nueva deuda desembolsada'),repay=d('debtRepay','Principal deuda amortizado'),equityIssue=d('equityIssue','Aportaciones explícitas de capital'),payout=d('payout','Pay-out de beneficio positivo','tasa'),leasePayment=d('leasePayment','Pago total leasing'),leaseRate=d('leaseRate','Tipo efectivo leasing','tasa');
  const debt:Expr[]=[],ld:Expr[]=[],interest:Expr[]=[],leaseInterest:Expr[]=[],leasePrincipal:Expr[]=[],netIncome:Expr[]=[],taxes:Expr[]=[],nol:Expr[]=[],dividends:Expr[]=[],cash:Expr[]=[],equity:Expr[]=[],cfo:Expr[]=[],cff:Expr[]=[],cfi:Expr[]=[],preTax:Expr[]=[];
  for(let i=0;i<5;i++){
   const prevDebt=i?debt[i-1]:histDebt[3],prevLease=i?ld[i-1]:histLease[3],prevCash=i?cash[i-1]:histCash[3],prevEquity=i?equity[i-1]:histEquity[3],nolOpen=i?nol[i-1]:this.c('nol','Pérdidas fiscales acreditadas de apertura');
   debt[i]=this.celda('S_Modelo','modelo.debt','Deuda al cierre',i,iff(ge(add(prevDebt,newDebt[i]),repay[i]),sub(add(prevDebt,newDebt[i]),repay[i]),div(1,0)));
   leaseInterest[i]=this.celda('S_Modelo','modelo.leaseInterest','Interés leasing (saldo de apertura)',i,mul(prevLease,leaseRate[i],this.yearFraction(i)));
   leasePrincipal[i]=this.celda('S_Modelo','modelo.leasePrincipal','Principal leasing',i,iff(ge(leasePayment[i],leaseInterest[i]),iff(ge(add(prevLease,leaseNew[i],leaseInterest[i]),leasePayment[i]),sub(leasePayment[i],leaseInterest[i]),div(1,0)),div(1,0)));
   ld[i]=this.celda('S_Modelo','modelo.leaseDebt','Pasivo leasing al cierre',i,sub(add(prevLease,leaseNew[i]),leasePrincipal[i]));
   interest[i]=this.celda('S_Modelo','modelo.interest','Interés deuda (saldo de apertura)',i,mul(prevDebt,kd[i],this.yearFraction(i)));
   preTax[i]=this.celda('S_Modelo','modelo.preTax','Resultado antes de impuestos',i,add(sub(sub(ebit[i],interest[i]),leaseInterest[i]),ledger?.financialProfit[i]??0));
   const taxable=sub(max(0,preTax[i]),min(nolOpen,max(0,preTax[i])));
   taxes[i]=this.celda('S_Modelo','modelo.taxPaid','Impuesto efectivamente pagado',i,fiscal?.paid[i]??mul(taxable,tax[i]));
   nol[i]=this.celda('S_Modelo','modelo.nol','Pérdidas fiscales al cierre',i,fiscal?.nol[i]??add(sub(nolOpen,min(nolOpen,max(0,preTax[i]))),max(0,mul(-1,preTax[i]))));
   netIncome[i]=this.celda('S_Modelo','modelo.netIncome','Resultado neto',i,sub(preTax[i],fiscal?.expense[i]??taxes[i]));
   dividends[i]=this.celda('S_Modelo','modelo.dividends','Dividendos según política explícita',i,mul(max(0,netIncome[i]),payout[i]));
   equity[i]=this.celda('S_Modelo','modelo.equity','Patrimonio al cierre',i,sub(add(prevEquity,netIncome[i],equityIssue[i],ledger?.oci[i]??0),add(dividends[i],fiscal?.oci[i]??0)));
   cfo[i]=this.celda('S_Modelo','modelo.cfo','CFO tras intereses e impuestos',i,add(sub(sub(add(netIncome[i],da[i],imp[i]),gain[i]),deltaNWC[i]),ledger?.cfoAdjustment[i]??0,fiscal?.cfoAdjustment[i]??0));
   cfi[i]=this.celda('S_Modelo','modelo.cfi','CF inversión monetaria',i,add(sub(disposal[i],capex[i]),ledger?.cfi[i]??0));
   cff[i]=this.celda('S_Modelo','modelo.cff','CF financiación monetaria',i,add(sub(sub(sub(add(newDebt[i],equityIssue[i]),repay[i]),dividends[i]),leasePrincipal[i]),ledger?.cff[i]??0));
   cash[i]=this.celda('S_Modelo','modelo.cash','Tesorería por flujos (sin plug)',i,add(prevCash,cfo[i],cfi[i],cff[i]));
  }
  Object.assign(this.salida,{debt,leaseDebt:ld,interest,leaseInterest,leasePrincipal,preTax,taxPaid:taxes,nol,netIncome,dividends,equity,cfo,cfi,cff,cash});
  if(fiscal)Object.assign(this.salida,{taxExpense:fiscal.expense,deferredTax:fiscal.deferred,taxAssets:fiscal.assets,taxLiabilities:fiscal.liabilities,operatingCashTax:fiscal.operatingPaid});
  if(ledger)Object.assign(this.salida,{otherAssets:ledger.assets,otherLiabilities:ledger.liabilities,otherOCI:ledger.oci,noncashRecognitionBalance:ledger.noncashRecognitionBalance});
  const advanced=this.entradaOriginal.fechaEventos==='SEGMENTOS_ACT_ACT_FISCAL';
  const advances=advanced?sm('capexAdvance','Anticipos para inversión por cohortes',this.years.map((_,i)=>add(...this.activos.map(a=>(a as ResultadoAvanzado).capexAdvance[i])))):this.years.map(()=>0);
  const assets=sm('assets','Total activo',totalAssets.map((a,i)=>add(a,inventory[i],ar[i],contractAssets[i],cash[i],advances[i],ledger?.assets[i]??0,fiscal?.assets[i]??0)));
  const capexPayable=advanced?sm('capexPayable','Crédito de inversión por cohortes',this.years.map((_,i)=>add(...this.activos.map(a=>(a as ResultadoAvanzado).capexPayable[i])))):this.years.map(()=>0);
  const capexCreditChange=advanced?sm('capexCreditChange','Variación del crédito de inversión',capexPayable.map((v,i)=>sub(v,i?capexPayable[i-1]:this.c('capexPayableOpening','Crédito de inversión de apertura')))):this.years.map(()=>0);
  const liabilities=sm('liabilitiesEquity','Pasivo + patrimonio',equity.map((e,i)=>add(e,debt[i],ld[i],ap[i],contractLiabilities[i],capexPayable[i],ledger?.liabilities[i]??0,fiscal?.liabilities[i]??0)));
  sm('balanceDifference','Diferencia de balance',assets.map((a,i)=>sub(a,liabilities[i])));
  if(this.entradaOriginal.sector===10){// Las altas de RAB no pueden exceder las altas de inmovilizado propio reconocidas (pagado + Δcrédito − Δanticipos).
   const eligible=this.driver('eligibleInvestment','Inversión admitida en RAB'),recognized=sm('ownAdditions','Altas de inmovilizado propio reconocidas',capex.map((c,i)=>advanced?sub(add(c,sub(capexPayable[i],i?capexPayable[i-1]:this.c('capexPayableOpening','Crédito de inversión de apertura'))),sub(advances[i],i?advances[i-1]:0)):c));
   this.salida.rabAdditionsCheck=sm('rabAdditionsCheck','Inversión admitida en RAB ≤ altas reconocidas',recognized.map((r,i)=>iff(ge(add(r,1e-8),eligible[i]),1,0)),'indicador');}
  const nopat=sm('nopat',complete?'EBIT menos impuesto operativo de caja acreditado':'NOPAT sin beneficio fiscal de pérdidas',ebit.map((v,i)=>sub(v,fiscal?.operatingPaid[i]??mul(max(0,v),tax[i]))));
  const fcff=sm('fcff','FCFF económico (altas financiadas incluidas)',nopat.map((n,i)=>add(sub(sub(sub(add(n,da[i],imp[i],disposal[i]),gain[i]),add(capex[i],leaseNew[i],capexCreditChange[i])),deltaNWC[i]),ledger?.fcffAdjustment[i]??0)));
  const interestShield=sm('taxShield','Diferencia entre impuesto operativo y pago apalancado',tax.map((t,i)=>sub(fiscal?.operatingPaid[i]??mul(max(0,ebit[i]),t),taxes[i])));
  sm('cashFcffBridge','Puente CFO a FCFF económico',cfo.map((cf,i)=>sub(add(cf,interest[i],leaseInterest[i],disposal[i],ledger?.fcffAdjustment[i]??0),add(interestShield[i],capex[i],leaseNew[i],capexCreditChange[i],ledger?.financialProfit[i]??0,ledger?.cfoAdjustment[i]??0))));
  if(this.entradaOriginal.sector===15){
   sm('noi','NOI de inmuebles antes de gastos corporativos y financiación',revenue.map((r,i)=>sub(r,cogs[i])));
   const propertyDA=sm('propertyDA','D&A inmuebles / PPE',this.agregadoActivo('depreciacion',a=>a.clase==='PPE'));
   const maintenance=capexMaintenance;
   const affo=sm('affo','AFFO explícito sin ganancias por bajas',netIncome.map((ni,i)=>sub(sub(add(ni,propertyDA[i],imp[i]),gain[i]),maintenance[i])));
   const appraisal=this.driver('appraisal','Valor razonable externo de inmuebles');
   sm('nav','NAV: tasación + otros activos netos',appraisal.map((a,i)=>sub(add(a,cash[i],ar[i]),add(debt[i],ld[i],ap[i],contractLiabilities[i]))));
   this.valoracion(affo,ke,'EQUITY',histCash[3],histDebt[3],histLease[3]);
  }else this.valoracion(fcff,wacc,'FCFF',histCash[3],advanced?add(histDebt[3],this.c('capexPayableOpening','Crédito de inversión de apertura')):histDebt[3],histLease[3]);
  this.revision();
 }
 valoracion(flujos:Expr[],rates:Expr[],family:'FCFF'|'EQUITY',cash:Expr,debt:Expr,lease:Expr){
  const sm=(id:string,label:string,x:Expr[],unit='importe')=>this.serie('S_Valoracion','valor.'+id,label,x,unit),g=this.driver('terminalG','Crecimiento terminal','tasa');
  const factors:Expr[]=[];for(let i=0;i<5;i++)factors[i]=this.celda('S_Valoracion','valor.factor','Factor de descuento acumulado desde fecha de valoración',i,mul(i?factors[i-1]:1,pow(add(1,rates[i]),this.yearFraction(i))),'ratio');
  const pv=sm('pv','Valor presente del flujo',flujos.map((f,i)=>div(f,factors[i])));
  this.salida.valuationPV=pv;this.salida.valuationFactor=factors;
  let normalized:Expr;
  if(family==='FCFF'){
   const nopat=this.driver('terminalNOPAT','NOPAT normalizado del año 6'),roic=this.driver('terminalROIC','ROIC incremental terminal','tasa');
   normalized=iff(gt(roic[4],0),mul(nopat[4],sub(1,div(g[4],roic[4]))),div(1,0));
  }else if(this.entradaOriginal.sector===15){
   const affo=this.driver('terminalAFFO','AFFO normalizado del año 6'),growth=this.driver('terminalEquityGrowthInvestment','Reinversión terminal financiada por equity');normalized=sub(affo[4],growth[4]);
  }else{
   const ni=this.driver('terminalNetIncome','Beneficio normalizado del año 6'),roe=this.driver('terminalROE','ROE incremental terminal','tasa');normalized=iff(gt(roe[4],0),mul(ni[4],sub(1,div(g[4],roe[4]))),div(1,0));
  }
  const terminalFlow=sm('terminalFlow','Flujo terminal normalizado después de reinversión',this.years.map(()=>normalized));
  const terminal=this.entradaOriginal.terminal==='FINITO'?this.c('terminalLiquidation','Liquidación al final del horizonte'):iff(gt(rates[4],g[4]),div(terminalFlow[4],sub(rates[4],g[4])),div(1,0));
  const terminalPV=div(terminal,factors[4]);
  this.salida.terminalPV=sm('terminalPV','Valor presente del terminal',this.years.map(()=>terminalPV));
  this.salida.explicitPV=sm('explicitPV','Valor presente de los cinco flujos',this.years.map(()=>add(...pv)));
  // La disponibilidad se valida en el build propietario, nunca leyendo S_Revision.
  const disponible:Expr[]=[];
  for(let i=0;i<5;i++){
   let own:Expr=mul(iff(ge(1e-8,op('ABS',this.salida.balanceDifference[i])),1,0),iff(ge(this.salida.cash[i],0),1,0));
   if(this.salida.capitalShortfall)own=mul(own,iff(ge(1e-8,this.salida.capitalShortfall[i]),1,0));
   if(this.salida.rabAdditionsCheck)own=mul(own,this.salida.rabAdditionsCheck[i]);
   disponible.push(this.celda('S_Modelo','modelo.availability','Estados completos y financiación disponible',i,own,'indicador'));
  }
  const inputEligible=this.entradaOriginal.tipo==='EMPRESA'?this.constante('entrada.elegible','Validación de la entrada financiera por el servidor',this.entradaOriginal.evidenciaEntrada?.elegible===true?1:0,'indicador'):1;
  const eligibility=this.constExpr('S_Valoracion','valor.available','Disponibilidad de datos, estados y financiación',mul(inputEligible,...disponible),'indicador');
  const total=iff(eligibility,add(...pv,terminalPV),div(1,0)),equity=family==='FCFF'?sub(sub(add(total,cash),debt),lease):total;
  this.salida.valuationFlow=flujos;this.salida.valuationRate=rates;
  this.salida.terminal=sm('terminal','Valor terminal (no descontado)',this.years.map(()=>terminal));
  this.salida.enterprise=sm('enterprise',family==='FCFF'?'Enterprise Value':'Valor del equity (EV no aplicable)',this.years.map(()=>total));
  this.salida.equityValue=sm('equity','Equity a fecha de valoración',this.years.map(()=>equity));
  this.salida.price=sm('price','Valor por acción',this.years.map(()=>div(equity,this.c('shares','Acciones conciliadas','unidades'))));
 }
 constExpr(hoja:string,id:string,label:string,x:Expr,unidad='importe'):Expr {return this.grafo.insertar({id,hoja,fila:this.fila(hoja,id,label),columna:13,etiqueta:label,unidad,expr:x});}
 revision(){
  const f=this.salida;this.serie('S_Revision','revision.balance','Descuadre de balance',f.balanceDifference??this.years.map(()=>div(1,0)));
  if(f.fcff&&f.cashFcffBridge)this.serie('S_Revision','revision.fcffBridge','FCFF - puente CFO',f.fcff.map((x,i)=>sub(x,f.cashFcffBridge[i])));
  if(f.cash)this.serie('S_Revision','revision.cashNegative','Tesorería insuficiente (1 = sí)',f.cash.map(x=>op('>',0,x)),'indicador');
 }
 banca(){this.financiera('BANK');}
 seguros(){this.financiera('INSURANCE');}
 financiera(tipo:'BANK'|'INSURANCE'){
  const d=(k:string,l=k,u='importe')=>this.driver(k,l,u),sm=(k:string,l:string,x:Expr[],u='importe')=>this.serieModelo(k,l,x,u),{ke,tax}=this.capital();
  const hCash=this.base('cash','Caja de apertura'),hEquity=this.base('equity','Patrimonio de apertura');
  const expense=d('operatingExpense','Gasto operativo pagado'),payout=d('payout','Pay-out solicitado','tasa'),newEquity=d('equityIssue','Aportaciones explícitas de capital');
  const cash:Expr[]=[],equity:Expr[]=[],income:Expr[]=[],taxPaid:Expr[]=[],dividends:Expr[]=[],required:Expr[]=[],revenue:Expr[]=[],assets:Expr[]=[],liabs:Expr[]=[],flows:Expr[]=[],operatingCF:Expr[]=[],lendingCF:Expr[]=[],fundingCF:Expr[]=[];
  const loanGrowth=tipo==='BANK'?d('loanGrowth','Crecimiento préstamos','tasa'):[],depositGrowth=tipo==='BANK'?d('depositGrowth','Crecimiento depósitos','tasa'):[],loanYield=tipo==='BANK'?d('loanYield','Rendimiento préstamos','tasa'):[],depositCost=tipo==='BANK'?d('depositCost','Coste depósitos','tasa'):[],provisionRate=tipo==='BANK'?d('provisionRate','Dotación de ECL / saldo inicial','tasa'):[],writeoffs=tipo==='BANK'?d('writeoffs','Bajas contra ECL'):[],fee=tipo==='BANK'?d('fees','Comisiones netas'):[],rw=tipo==='BANK'?d('riskWeight','Ponderación riesgo préstamos','tasa'):[];
  const cashYield=d('cashYield','Rendimiento de la tesorería','tasa'),otherRw=tipo==='BANK'?d('otherRiskWeight','Ponderación de riesgo de otros activos','tasa'):[];
  const target=d('regulatoryTarget',tipo==='BANK'?'Objetivo CET1 / RWA':'Objetivo fondos / requisito solvencia','tasa'),deduct=d('regulatoryDeductions','Deducciones fondos propios'),other=d('otherAssets','Otros activos explícitos');
  const serviceRevenue=tipo==='INSURANCE'?d('insuranceRevenue','Ingreso de servicio (no primas)'):[],incurred=tipo==='INSURANCE'?d('claimsIncurred','Gasto de servicio / siniestros incurridos'):[],premiumCash=tipo==='INSURANCE'?d('premiumsCash','Primas cobradas'):[],claimsPaid=tipo==='INSURANCE'?d('claimsPaid','Siniestros pagados'):[],financeExpense=tipo==='INSURANCE'?d('insuranceFinance','Gasto financiero contratos'):[],investYield=tipo==='INSURANCE'?d('investmentYield','Rendimiento inversión','tasa'):[],investNet=tipo==='INSURANCE'?d('netInvestment','Compras netas inversiones'):[],solvency=tipo==='INSURANCE'?d('solvencyRequirement','Requisito de solvencia'):[];
  const loans:Expr[]=[],deposits:Expr[]=[],allowance:Expr[]=[],insuranceLiab:Expr[]=[],investments:Expr[]=[],rwa:Expr[]=[],provisions:Expr[]=[],distributable:Expr[]=[];
  const historical:Record<string,Expr[]>={};for(const k of tipo==='BANK'?['loans','deposits','allowance','wholesale','otherAssets']:['insuranceLiability','investments','otherAssets'])historical[k]=this.base(k);
  for(let i=0;i<5;i++){
   const openCash=i?cash[i-1]:hCash[3],openEquity=i?equity[i-1]:hEquity[3];let profit:Expr,deltaOperatingAssets:Expr,deltaLiabilities:Expr,cashOp:Expr;
   if(tipo==='BANK'){
    const openLoans=i?loans[i-1]:historical.loans[3],openDeposits=i?deposits[i-1]:historical.deposits[3],openAllowance=i?allowance[i-1]:historical.allowance[3];
    provisions[i]=this.celda('S_Modelo','modelo.provisions','Dotación de provisiones ECL',i,mul(openLoans,provisionRate[i],this.yearFraction(i)));
    loans[i]=this.celda('S_Modelo','modelo.loans','Préstamos brutos al cierre',i,sub(mul(openLoans,pow(add(1,loanGrowth[i]),this.yearFraction(i))),writeoffs[i]));
    allowance[i]=this.celda('S_Modelo','modelo.allowance','Corrección ECL al cierre',i,iff(ge(add(openAllowance,provisions[i]),writeoffs[i]),sub(add(openAllowance,provisions[i]),writeoffs[i]),div(1,0)));
    deposits[i]=this.celda('S_Modelo','modelo.deposits','Depósitos al cierre',i,mul(openDeposits,pow(add(1,depositGrowth[i]),this.yearFraction(i))));
    const wholesale=historical.wholesale[3],wholesaleCost=mul(wholesale,d('wholesaleRate','Coste financiación mayorista','tasa')[i],this.yearFraction(i));
    revenue[i]=this.celda('S_Modelo','modelo.revenue','Margen financiero, rendimiento de tesorería y comisiones',i,add(sub(sub(mul(openLoans,loanYield[i],this.yearFraction(i)),mul(openDeposits,depositCost[i],this.yearFraction(i))),wholesaleCost),mul(openCash,cashYield[i],this.yearFraction(i)),fee[i]));
    profit=sub(sub(revenue[i],expense[i]),provisions[i]);
    deltaOperatingAssets=sub(add(sub(loans[i],allowance[i]),other[i]),add(sub(openLoans,openAllowance),i?other[i-1]:historical.otherAssets[3]));
    deltaLiabilities=sub(deposits[i],openDeposits);cashOp=add(sub(profit,deltaOperatingAssets),deltaLiabilities);
    rwa[i]=this.celda('S_Modelo','modelo.rwa','RWA préstamos + otros activos (modelo explícito simplificado)',i,add(mul(sub(loans[i],allowance[i]),rw[i]),mul(other[i],otherRw[i])));
    required[i]=this.celda('S_Modelo','modelo.required','Capital objetivo + deducciones',i,add(mul(rwa[i],target[i]),deduct[i]));
    liabs[i]=add(deposits[i],wholesale);
    assets[i]=add(sub(loans[i],allowance[i]),other[i]);
   }else{
    const openInvest=i?investments[i-1]:historical.investments[3],openLiab=i?insuranceLiab[i-1]:historical.insuranceLiability[3];
    investments[i]=this.celda('S_Modelo','modelo.investments','Inversiones al cierre',i,add(openInvest,investNet[i]));
    revenue[i]=this.celda('S_Modelo','modelo.revenue','Resultado servicio + rendimiento inversiones y tesorería',i,add(sub(serviceRevenue[i],incurred[i]),mul(openInvest,investYield[i],this.yearFraction(i)),mul(openCash,cashYield[i],this.yearFraction(i))));
    profit=sub(sub(revenue[i],expense[i]),financeExpense[i]);
    insuranceLiab[i]=this.celda('S_Modelo','modelo.insuranceLiability','Pasivo contratos, rollforward agregado',i,add(sub(sub(add(openLiab,premiumCash[i],incurred[i],financeExpense[i]),claimsPaid[i]),serviceRevenue[i]),0));
    required[i]=this.celda('S_Modelo','modelo.required','Fondos objetivo + deducciones',i,add(mul(solvency[i],target[i]),deduct[i]));
    deltaOperatingAssets=sub(add(investments[i],other[i]),add(openInvest,i?other[i-1]:historical.otherAssets[3]));
    deltaLiabilities=sub(insuranceLiab[i],openLiab);cashOp=add(sub(profit,deltaOperatingAssets),deltaLiabilities);
    assets[i]=add(investments[i],other[i]);liabs[i]=insuranceLiab[i];
   }
   taxPaid[i]=this.celda('S_Modelo','modelo.taxPaid','Impuesto sin activo por pérdidas',i,mul(max(0,profit),tax[i]));
   income[i]=this.celda('S_Modelo','modelo.netIncome','Resultado neto',i,sub(profit,taxPaid[i]));
   const available=max(0,sub(add(openEquity,income[i],newEquity[i]),required[i]));
   dividends[i]=this.celda('S_Modelo','modelo.dividends','Dividendo limitado por capital objetivo',i,min(mul(max(0,income[i]),payout[i]),available));
   equity[i]=this.celda('S_Modelo','modelo.equity','Patrimonio al cierre',i,sub(add(openEquity,income[i],newEquity[i]),dividends[i]));
   distributable[i]=this.celda('S_Modelo','modelo.distributable','Capital económico distribuible (puede exigir aporte)',i,sub(income[i],sub(required[i],i?required[i-1]:this.c('requiredOpening','Capital regulatorio objetivo inicial'))));
   operatingCF[i]=this.celda('S_Modelo','modelo.cfo','Flujo neto operativo y de activos financieros',i,sub(cashOp,taxPaid[i]));
   fundingCF[i]=this.celda('S_Modelo','modelo.cff','Aportaciones menos dividendos',i,sub(newEquity[i],dividends[i]));
   cash[i]=this.celda('S_Modelo','modelo.cash','Tesorería derivada de flujos',i,add(openCash,operatingCF[i],fundingCF[i]));
   assets[i]=this.celda('S_Modelo','modelo.assets','Total activo',i,add(assets[i],cash[i]));
   liabs[i]=this.celda('S_Modelo','modelo.liabilitiesEquity','Pasivo + patrimonio',i,add(liabs[i],equity[i]));
   flows[i]=this.celda('S_Modelo','modelo.fcfe','FCFE distribuible, neto de capital requerido',i,distributable[i]);
  }
  Object.assign(this.salida,{cash,equity,netIncome:income,taxPaid,dividends,required,revenue,assets,liabilitiesEquity:liabs,cfo:operatingCF,cff:fundingCF,fcfe:flows,loans,deposits,allowance,insuranceLiability:insuranceLiab,investments,rwa,provisions});
  sm('capitalShortfall','Déficit regulatorio sin aportación automática',equity.map((e,i)=>max(0,sub(required[i],e))));
  sm('balanceDifference','Diferencia de balance',assets.map((a,i)=>sub(a,liabs[i])));
  this.valoracion(flows,ke,'EQUITY',hCash[3],0,0);this.revision();
 }
}
export function crearPlan(input:Entrada){return new Plan(input).build();}
