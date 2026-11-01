// Agregación local de consultas reales. No conecta a MySQL ni calcula primas.
const fs=require('node:fs'),path=require('node:path');
const dir=path.join(__dirname,'evidencias');
const d=JSON.parse(fs.readFileSync(path.join(dir,'observaciones_financieras.json')));
const md=JSON.parse(fs.readFileSync(path.join(dir,'metadatos.json')));
const metrics=['INGRESOS','EBITDA','EBIT','ACTIVOS_TOTALES','EFECTIVO','DEUDA_FINANCIERA','DEUDA_NETA','PATRIMONIO_NETO','CFO','CAPEX','FCF','COBERTURA_INTERESES','DEUDA_NETA_EBITDA','CURRENT_RATIO','QUICK_RATIO','CASH_RATIO'];
const bundles={TAMANO_BASICO:['INGRESOS','EBITDA','ACTIVOS_TOTALES'],TAMANO_AMPLIADO:['INGRESOS','EBITDA','ACTIVOS_TOTALES','EBIT','EFECTIVO','DEUDA_FINANCIERA','PATRIMONIO_NETO'],LIQUIDEZ_PARCIAL:['EFECTIVO','DEUDA_FINANCIERA','CFO','FCF','COBERTURA_INTERESES','DEUDA_NETA_EBITDA'],LIQUIDEZ_COMPLETA:['EFECTIVO','DEUDA_FINANCIERA','CFO','FCF','COBERTURA_INTERESES','DEUDA_NETA_EBITDA','CURRENT_RATIO','QUICK_RATIO','CASH_RATIO']};
const group=(xs,key)=>{const m=new Map();for(const x of xs){const k=key(x);if(!m.has(k))m.set(k,[]);m.get(k).push(x);}return m;};
const unique=(xs,fn)=>new Set(xs.filter(fn).map(r=>r.empresa_id)).size;
const has=(r,fields)=>fields.every(f=>r.metrics[f]);
const counts=(rs,den)=>({denominatorCompanies:den,reports:rs.length,companiesWithReport:unique(rs,()=>true),companiesWithPublishedReport:unique(rs,r=>r.eligible),companiesWithAnyNumeric:unique(rs,r=>Object.keys(r.metrics).length>0),companiesWithAnyPublishedNumeric:unique(rs,r=>r.eligible&&Object.keys(r.metrics).length>0),
  companiesWithContext:unique(rs,r=>r.contextIdentified),companiesWithRawShares:unique(rs,r=>r.sharesPositive),companiesWithPublishedShares:unique(rs,r=>r.eligible&&r.sharesPositive),
  metrics:Object.fromEntries(metrics.map(f=>[f,{storedCompanies:unique(rs,r=>r.metrics[f]),eligibleCompanies:unique(rs,r=>r.eligible&&r.metrics[f]),attestationMetadataCompanies:unique(rs,r=>r.eligible&&r.metrics[f]?.attestationMetadata),
    storedReports:rs.filter(r=>r.metrics[f]).length,eligibleReports:rs.filter(r=>r.eligible&&r.metrics[f]).length,origins:Object.fromEntries(['PCV','DERIVADO','KPI'].map(o=>[o,rs.filter(r=>r.metrics[f]?.origin===o).length]))}])),
  bundles:Object.fromEntries(Object.entries(bundles).map(([id,fields])=>[id,{storedCompanies:unique(rs,r=>has(r,fields)),eligibleCompanies:unique(rs,r=>r.eligible&&has(r,fields)),contextCompanies:unique(rs,r=>r.contextIdentified&&has(r,fields)),
    attestationMetadataCompanies:unique(rs,r=>r.eligible&&fields.every(f=>r.metrics[f]?.attestationMetadata)),eligibleReports:rs.filter(r=>r.eligible&&has(r,fields)).length}]))});
const companyBy=new Map(d.companies.map(c=>[c.id,c]));
const reportBy=group(d.reports,r=>r.empresa_id),instrumentsBy=group(d.instruments,i=>i.empresa_id);
const cap=[];
for(const co of d.companies){
  const rs=reportBy.get(co.id)||[],qs=(instrumentsBy.get(co.id)||[]).filter(i=>i.precio_cierre!==null&&Number(i.precio_cierre)>0&&i.fecha&&i.fecha<=d.asOf);
  const shares=rs.filter(r=>r.eligible&&r.sharesPositive),viv=d.latestVivShares[co.id];
  const anyViv=!!viv&&!viv.dateMismatch&&viv.fechaPublicacion&&viv.fechaPublicacion>=viv.fecha&&viv.fechaPublicacion<=d.asOf;
  const partial=qs.length>0&&(shares.length>0||anyViv);
  const compatibleDate=qs.some(q=>shares.some(s=>s.fin<=q.fecha&&s.publicacion<=q.fecha&&s.currency===q.moneda));
  const equalDate=qs.some(q=>shares.some(s=>s.fin===q.fecha&&s.publicacion<=q.fecha&&s.currency===q.moneda));
  cap.push({empresa_id:co.id,country:co.codigo_iso,price:qs.length>0,shareNumeric:shares.length>0,shareVivOnly:shares.length===0&&anyViv,partial,compatibleDate,equalDate,
    multipleInstruments:(instrumentsBy.get(co.id)||[]).length>1,reliableAutomatically:false});
}
const overall=counts(d.reports,d.companies.length),byCountry={},byYear=[];
for(const country of ['US','JP','TW']){
  const cos=d.companies.filter(c=>c.codigo_iso===country),rs=d.reports.filter(r=>r.country===country),caps=cap.filter(c=>c.country===country);
  byCountry[country]={...counts(rs,cos.length),priceCompanies:caps.filter(c=>c.price).length,shareVivOnly:caps.filter(c=>c.shareVivOnly).length,
    capitalizationPartial:caps.filter(c=>c.partial).length,capitalizationDateCompatible:caps.filter(c=>c.compatibleDate).length,capitalizationExactDate:caps.filter(c=>c.equalDate).length,capitalizationReliable:0,capitalizationUnavailable:caps.filter(c=>!c.partial).length,
    registeredWithoutInstrument:cos.filter(c=>!instrumentsBy.has(c.id)).length,multipleInstrumentCompanies:caps.filter(c=>c.multipleInstruments).length,
    familyCounts:Object.fromEntries([...group(cos,c=>c.family)].map(([k,x])=>[k,x.length])),overlayAccepted:cos.filter(c=>c.overlayAccepted).length,
    noSectorOriginal:cos.filter(c=>c.sector_id===221||c.sector_id===null).length,noSectorEffective:cos.filter(c=>c.effectiveSector===221||c.effectiveSector===null).length};
  for(const year of [2022,2023,2024,2025,2026])byYear.push({country,year,...counts(rs.filter(r=>r.year===year),cos.length)});
}
overall.priceCompanies=cap.filter(c=>c.price).length;overall.capitalizationPartial=cap.filter(c=>c.partial).length;overall.capitalizationReliable=0;overall.capitalizationUnavailable=cap.filter(c=>!c.partial).length;
for(const [country,result]of [['TOTAL',overall],...Object.entries(byCountry)]){
  const rs=country==='TOTAL'?d.reports:d.reports.filter(r=>r.country===country);
  for(const [id,fields]of Object.entries(bundles)){
    result.bundles[id].nonfinancialResolved=unique(rs,r=>r.eligible&&has(r,fields)&&['FCFF','RESOURCE','PHARMA','REIT'].includes(companyBy.get(r.empresa_id)?.family));
    result.bundles[id].familyPending=unique(rs,r=>r.eligible&&has(r,fields)&&companyBy.get(r.empresa_id)?.family==='INDETERMINADA');
    result.bundles[id].financialFamily=unique(rs,r=>r.eligible&&has(r,fields)&&['BANK','INSURANCE'].includes(companyBy.get(r.empresa_id)?.family));
  }
}
const fourYears={};
for(const [id,fields]of Object.entries(bundles)){
  let potential=0,withCommonContext=0;
  for(const co of d.companies){const rs=reportBy.get(co.id)||[];if([2022,2023,2024,2025].every(y=>rs.some(r=>r.year===y&&r.eligible&&has(r,fields))))potential++;
    if(['consolidated','standalone'].some(basis=>[2022,2023,2024,2025].every(y=>rs.some(r=>r.year===y&&r.contextIdentified&&r.basis===basis&&has(r,fields)))))withCommonContext++;
  }
  fourYears[id]={potential,withCommonContext};
}
const sectors=new Map(md.ddl.sector?JSON.parse(fs.readFileSync(path.join(dir,'contexto_y_referencias.json'))).reference.sectors.map(s=>[s.id,s.nombre_sector]):[]);
const comparable=[];
for(const [key,cos]of group(d.companies,c=>c.codigo_iso+':'+c.effectiveSector)){
  const ids=new Set(cos.map(c=>c.id)),rs=d.reports.filter(r=>ids.has(r.empresa_id)&&r.year===2025&&r.eligible),known=cos.filter(c=>c.mappingStatus!=='REVISAR'&&c.family!=='INDETERMINADA'&&c.effectiveSector!==221);
  comparable.push({country:cos[0].codigo_iso,sectorId:cos[0].effectiveSector,sector:sectors.get(cos[0].effectiveSector)??'DESCONOCIDO',registered:cos.length,mappingKnown:known.length,
    revenueNumeric:unique(rs,r=>r.metrics.INGRESOS),ebitdaNumeric:unique(rs,r=>r.metrics.EBITDA),assetsNumeric:unique(rs,r=>r.metrics.ACTIVOS_TOTALES),
    consolidatedContextRevenue:unique(rs,r=>r.contextIdentified&&r.basis==='consolidated'&&r.metrics.INGRESOS),
    consolidatedContextSize:unique(rs,r=>r.contextIdentified&&r.basis==='consolidated'&&has(r,bundles.TAMANO_BASICO)),
    shareNumeric:unique(rs,r=>r.sharesPositive),priceCompanies:cap.filter(c=>ids.has(c.empresa_id)&&c.price).length,capitalizationReliable:0,amihud:0});
}
comparable.sort((a,b)=>b.registered-a.registered||a.country.localeCompare(b.country));
const markets=[...group(d.instruments,i=>i.mercado_id)].map(([marketId,is])=>({marketId,instruments:is.length,companies:new Set(is.map(i=>i.empresa_id)).size,pricedInstruments:is.filter(i=>Number(i.precio_cierre)>0&&i.fecha).length}));
const sourceBasis=[...group(d.reports,r=>r.country+':'+r.basis+':'+r.currency)].map(([key,rs])=>({key,reports:rs.length,companies:unique(rs,()=>true),eligible:rs.filter(r=>r.eligible).length,contextIdentified:rs.filter(r=>r.contextIdentified).length}));
const samples={};
for(const country of ['US','JP','TW']){
  const chosen=[],seen=new Set();
  const rs=d.reports.filter(r=>r.country===country&&r.year===2025&&r.eligible&&has(r,bundles.TAMANO_BASICO)).sort((a,b)=>Number(b.contextIdentified)-Number(a.contextIdentified)||b.id-a.id);
  for(const r of rs)if(!seen.has(r.empresa_id)){chosen.push(r.id);seen.add(r.empresa_id);if(chosen.length===20)break;}
  samples[country]=chosen;
}
const summary={asOf:d.asOf,startedAtUtc:d.startedAtUtc,endedAtUtc:d.endedAtUtc,overall,byCountry,byYear,fourYears,comparable,markets,sourceBasis,sampleReportIds:samples,
  caveats:['Cobertura PCV/KPI de informes ANUALES 2022–2026; VIV se presenta aparte, sin mezclar sus importes con PCV.',
    'eligible exige publicación no nula, >= cierre y <= fecha de corte; no certifica la fecha frente al documento original.',
    'Contexto identificado y metadatos positivos de verificación no equivalen a cotejar cada importe contra candidato/record_id. Ninguna prima se calcula.',
    'capitalizationReliable=0 significa que no se acredita automáticamente una conciliación integral de clase/acciones propias/fecha/splits, no que ninguna empresa pueda valorarse tras una revisión individual.']};
fs.writeFileSync(path.join(dir,'cobertura_resumen.json'),JSON.stringify(summary,null,2)+'\n');
console.log(JSON.stringify({overall,byCountry:Object.fromEntries(Object.entries(byCountry).map(([k,v])=>[k,{companies:v.denominatorCompanies,publishedFinancial:v.companiesWithAnyPublishedNumeric,partialSize:v.bundles.TAMANO_BASICO,partialLiquidity:v.bundles.LIQUIDEZ_PARCIAL,prices:v.priceCompanies,capitalizationPartial:v.capitalizationPartial,noSectorEffective:v.noSectorEffective}])),fourYears,sourceBasis,samples},null,2));
