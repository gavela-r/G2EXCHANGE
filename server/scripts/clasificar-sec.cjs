const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const pool=require('../dist/conexion/bd').default,{SEC_SIC,identidadSecValida}=require('../dist/src/valoracion/evidenciaSec');
const {huella,serializar}=require('../dist/src/valoracion/datos');
const root=path.resolve(__dirname,'../..'),dir=path.join(root,'private_backups/sec-metadata');fs.mkdirSync(dir,{recursive:true});
const args=process.argv.slice(2),value=(key,fallback)=>args.includes(key)?args[args.indexOf(key)+1]:fallback;
const limit=Number(value('--limit','25')),offset=Number(value('--offset','0'));
if(!Number.isSafeInteger(limit)||limit<1||limit>1000||!Number.isSafeInteger(offset)||offset<0)throw new Error('limit 1..1000; offset >=0');
const asOf=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Madrid',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const contact=process.env.SEC_USER_AGENT||'G2Exchange '+cp.execFileSync('git',['config','user.email'],{encoding:'utf8'}).trim();if(!contact.includes('@'))throw new Error('Configurar SEC_USER_AGENT con contacto real');
async function request(url){const r=await fetch(url,{headers:{'User-Agent':contact},signal:AbortSignal.timeout(20000)});if(!r.ok)throw Error('SEC HTTP '+r.status);return r.json();}
(async()=>{
 const tickersFile=path.join(root,'private_backups/sec-company-tickers.json');
 const list=fs.existsSync(tickersFile)?JSON.parse(fs.readFileSync(tickersFile)):await request('https://www.sec.gov/files/company_tickers.json');
 const lookup=new Map();for(const row of Object.values(list)){const rows=lookup.get(row.ticker)||[];rows.push(row);lookup.set(row.ticker,rows);}
 const [instruments]=await pool.query("SELECT i.id,i.ticker,e.id empresa_id,e.nombre_empresa FROM instrumento i JOIN empresa e ON e.id=i.empresa_id JOIN pais p ON p.id=e.pais_id WHERE p.codigo_iso='US' AND e.sector_id=221 ORDER BY i.id LIMIT ? OFFSET ?",[limit,offset]);
 const report={date:asOf,offset,limit,processed:0,accepted:0,pending:0,errors:[],inserted:0};let failures=0;
 for(const i of instruments){try{
  const matches=lookup.get(i.ticker)||[];if(matches.length!==1){report.pending++;report.processed++;continue;}
  const cik=Number(matches[0].cik_str),url='https://data.sec.gov/submissions/CIK'+String(cik).padStart(10,'0')+'.json',cache=path.join(dir,String(cik)+'-'+asOf+'.json');
  const d=fs.existsSync(cache)?JSON.parse(fs.readFileSync(cache)):await request(url);fs.writeFileSync(cache,JSON.stringify(d));
  const identity=identidadSecValida(i.nombre_empresa,i.ticker,cik,d),sectorId=identity?SEC_SIC[String(d.sic)]:undefined;
  const evidence={empresa_id:i.empresa_id,instrument_id:i.id,ticker:i.ticker,source:url,source_identifier:'CIK:'+cik,reference_date:asOf,criterion:identity?'SEC_SIC_EXPLICIT_V1':'SEC_IDENTITY_PENDING_V1',confidence:sectorId?'HIGH':'LOW',status:sectorId?'ACCEPTED':'PENDING',sector_id:sectorId??null,metadata:{name:d.name,cik:d.cik,tickers:d.tickers,sic:d.sic,sicDescription:d.sicDescription}};
  if(args.includes('--write')){const [r]=await pool.query(`INSERT IGNORE INTO classification_evidence(empresa_id,sector_id,source,reference_date,source_identifier,criterion,confidence,status,evidence_hash,evidence_json) VALUES(?,?,?,?,?,?,?,?,?,?)`,[i.empresa_id,sectorId??null,url,asOf,evidence.source_identifier,evidence.criterion,evidence.confidence,evidence.status,huella(evidence),serializar(evidence)]);report.inserted+=r.affectedRows;}
  report.processed++;report[sectorId?'accepted':'pending']++;failures=0;
 }catch(e){report.errors.push({instrument_id:i.id,error:e.message});if(++failures>=5)break;}
 await new Promise(resolve=>setTimeout(resolve,350));
 }
 fs.writeFileSync(path.join(dir,'report-'+offset+'-'+limit+'-'+(args.includes('--write')?'write':'dry')+'.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));if(report.errors.length)process.exitCode=1;
})().catch(e=>{console.error(e.message);process.exitCode=1;}).finally(()=>pool.end());
