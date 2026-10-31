const {date}=require('./adapter.cjs');
const day=s=>Date.parse(date(s)+'T00:00:00Z')/86400000;
const civil=n=>new Date(n*86400000).toISOString().slice(0,10);
function forecastCalendar(periods,explicit,valuationDate){
 const issues=[],last=periods.at(-1);if(!last)return{periods:[],issues:['No existe cierre histórico']};
 const historic=periods.map(p=>({start:p.periodStart,end:p.periodEnd}));
 if(explicit){if(!Array.isArray(explicit)||explicit.length!==5)throw Error('Cinco períodos futuros requeridos');let previous=valuationDate??last.periodEnd;for(const [i,p]of explicit.entries()){date(p.start);date(p.end);const duration=day(p.end)-day(p.start)+1;if(day(p.start)!==day(previous)+1||duration<1||duration>381||i>0&&duration<350)throw Error('Calendario fiscal discontinuo o duración incompatible');if(valuationDate){date(p.fiscalStart);date(p.fiscalEnd);if(p.fiscalStart>p.start||p.fiscalEnd!==p.end||day(p.fiscalEnd)-day(p.fiscalStart)+1<350||day(p.fiscalEnd)-day(p.fiscalStart)+1>381)throw Error('Base anual fiscal no acreditada');}previous=p.end;}return{periods:explicit,issues:[],policy:'CALENDARIO_EXPLICITO_ANALISTA'};}
 if(new Set(historic.map(p=>p.end.slice(5))).size!==1)return{periods:[],issues:['Cierres de 52/53 semanas o transición: se requiere calendario fiscal explícito'],policy:'SIN_INFERENCIA_52_53_SEMANAS'};
 const result=[];let previous=last.periodEnd;const month=Number(previous.slice(5,7)),dayOfMonth=Number(previous.slice(8,10)),year=Number(previous.slice(0,4));
 for(let i=1;i<=5;i++){const lastDay=new Date(Date.UTC(year+i,month,0)).getUTCDate(),end=civil(Date.UTC(year+i,month-1,Math.min(dayOfMonth,lastDay))/86400000);result.push({start:civil(day(previous)+1),end});previous=end;}
 if(valuationDate){date(valuationDate);while(result[0]?.end<=valuationDate){const previous=result.at(-1),start=civil(day(previous.end)+1),y=Number(previous.end.slice(0,4))+1,lastDay=new Date(Date.UTC(y,month,0)).getUTCDate();result.shift();result.push({start,end:civil(Date.UTC(y,month-1,Math.min(dayOfMonth,lastDay))/86400000)});}for(const p of result){p.fiscalStart=p.start;p.fiscalEnd=p.end;}result[0].start=civil(day(valuationDate)+1);}
 return{periods:result,issues,policy:valuationDate?'PERIODO_PARCIAL_DESDE_VALORACION_ACT_ACT_FISCAL':'ANIVERSARIO_CIVIL_OBSERVADO_4_CIERRES'};
}
module.exports={forecastCalendar,day,civil};
