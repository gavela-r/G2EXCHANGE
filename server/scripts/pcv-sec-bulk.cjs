// SEC's documented nightly archives, streamed to private storage. No API key.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{Readable,Transform}=require('node:stream'),{pipeline}=require('node:stream/promises'),zip=require('yauzl');
const {guardarEstadoPcv,renombrarPcvAtomico}=require('./pcv-checkpoint.cjs');
const URLS={companyfacts:'https://www.sec.gov/Archives/edgar/daily-index/xbrl/companyfacts.zip',submissions:'https://www.sec.gov/Archives/edgar/daily-index/bulkdata/submissions.zip'};
const sha=async file=>{const h=crypto.createHash('sha256');for await(const b of fs.createReadStream(file))h.update(b);return h.digest('hex');};
function entradaPermitida(kind,name,ciks){const m=name.match(kind==='companyfacts'?/^CIK(\d{10})\.json$/:/^CIK(\d{10})(?:-submissions-\d+)?\.json$/);return !!m&&ciks.has(m[1]);}
async function descargar(kind,dir,userAgent,stop=()=>false){
 if(!URLS[kind]||!userAgent)throw Error('ARCHIVO_SEC_O_IDENTIFICACION_INVALIDOS');fs.mkdirSync(dir,{recursive:true});
 const file=path.join(dir,kind+'.zip'),manifest=file+'.manifest.json';
 if(fs.existsSync(file)&&fs.existsSync(manifest)){const m=JSON.parse(fs.readFileSync(manifest));if(m.sha256!==await sha(file))throw Error('ARCHIVO_SEC_HASH_INVALIDO');return m;}
 const partial=file+'.partial',meta=partial+'.json',old=fs.existsSync(meta)?JSON.parse(fs.readFileSync(meta)):null,start=fs.existsSync(partial)?fs.statSync(partial).size:0,headers={'User-Agent':userAgent,...(start&&old?.lastModified?{Range:'bytes='+start+'-','If-Range':old.lastModified}:{})};
 const response=await fetch(URLS[kind],{headers,redirect:'error',signal:AbortSignal.timeout(90*60000)});
 if(response.status===429)throw Error('CUOTA_AGOTADA_SEC_BULK');if(!response.ok)throw Error('HTTP_SEC_BULK_'+response.status);
 let append=false;if(response.status===206){if(!start||!String(response.headers.get('content-range')).startsWith('bytes '+start+'-'))throw Error('RANGO_SEC_NO_VERIFICADO');append=true;}else if(start)renombrarPcvAtomico(partial,partial+'.preserved-'+Date.now());
 const lastModified=response.headers.get('last-modified');guardarEstadoPcv(meta,{lastModified,url:URLS[kind],started_at:new Date().toISOString()});
 let bytes=append?start:0,last=Date.now();const cap=new Transform({transform(b,e,cb){bytes+=b.length;if(bytes>4*1024**3)return cb(Error('ARCHIVO_SEC_DEMASIADO_GRANDE'));if(stop())return cb(Error('PARADA_SOLICITADA'));if(Date.now()-last>30000){console.log(JSON.stringify({phase:'download',kind,bytes}));last=Date.now();}cb(null,b);}});
 await pipeline(Readable.fromWeb(response.body),cap,fs.createWriteStream(partial,{flags:append?'a':'w'}));
 const declared=response.headers.get('content-length');if(declared!==null&&bytes-(append?start:0)!==Number(declared))throw Error('DESCARGA_SEC_INCOMPLETA');
 const z=await zip.openPromise(partial);z.close();const m={url:URLS[kind],lastModified,downloaded_at:new Date().toISOString(),bytes,sha256:await sha(partial)};
 renombrarPcvAtomico(partial,file);guardarEstadoPcv(manifest,m);return m;
}
async function extraer(kind,dir,ciks,stop=()=>false){
 const out=path.join(dir,kind);fs.mkdirSync(out,{recursive:true});const archive=await zip.openPromise(path.join(dir,kind+'.zip'),{strictFileNames:true,validateEntrySizes:true});let count=0;
 try{for await(const entry of archive.eachEntry()){
  if(stop())throw Error('PARADA_SOLICITADA');if(!entradaPermitida(kind,entry.fileName,ciks))continue;
  if(entry.uncompressedSize>128*1024**2||entry.uncompressedSize<2)throw Error('ENTRADA_SEC_TAMANO_INVALIDO');
  const target=path.resolve(out,entry.fileName);if(path.dirname(target)!==path.resolve(out))throw Error('RUTA_SEC_INVALIDA');
  if(fs.existsSync(target)&&fs.statSync(target).size===entry.uncompressedSize){count++;continue;}
  await pipeline(await archive.openReadStreamPromise(entry),fs.createWriteStream(target+'.tmp'));renombrarPcvAtomico(target+'.tmp',target);count++;
  if(count%1000===0)console.log(JSON.stringify({phase:'extract',kind,entries:count}));
 }}finally{archive.close();}return count;
}
module.exports={URLS,entradaPermitida,descargar,extraer,sha};
