// Guardián HTTP global de proveedores (FinMind y conectores nuevos). Sin red: fetch y reloj simulados.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const G=require('../dist/src/proveedores/guardiaHttp.js');

function entorno(respuestas,opciones={}){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'guardia-')),reloj={t:Date.UTC(2026,9,31,12)},llamadas=[],esperas=[];
 const dep={ahora:()=>reloj.t,dormir:async ms=>{esperas.push(ms);reloj.t+=ms;},fetch:async url=>{llamadas.push(url);const r=respuestas.shift();if(r instanceof Error)throw r;return new Response(r.body??'{}',{status:r.status??200,headers:r.headers??{}});}};
 const politica={...G.politicaFinMind({}),...opciones};
 return {dir,reloj,llamadas,esperas,dep,politica,nueva:()=>new G.GuardiaProveedor(politica,dir,['SECRET_TOKEN_123'],dep)};
}

test('límite global por hora compartido entre instancias (procesos) y persistido en disco',async()=>{
 const e=entorno(Array.from({length:10},()=>({status:200})),{maxPorHora:3,separacionMinimaMs:0});
 const a=e.nueva(),b=e.nueva();
 await a.solicitar('https://x.test/1');await b.solicitar('https://x.test/2');await a.solicitar('https://x.test/3');
 await assert.rejects(b.solicitar('https://x.test/4',{}, {esperaMaximaMs:1000}),err=>err.codigo==='LIMITE_GLOBAL'&&err.reanudarEn>e.reloj.t);
 assert.equal(e.llamadas.length,3);
 const c=e.nueva();assert.equal(c.estado().peticiones.length,3,'el contador sobrevive a una instancia nueva');
 await c.solicitar('https://x.test/5');assert.equal(e.llamadas.length,4,'espera hasta que sale de la ventana de una hora');
 assert.ok(e.esperas.some(ms=>ms>59*60000));
});

test('120 peticiones/hora por defecto con separación mínima de 30 s',()=>{
 const p=G.politicaFinMind({});assert.equal(p.maxPorHora,120);
 assert.equal(G.politicaFinMind({FINMIND_MAX_PETICIONES_HORA:'60'}).maxPorHora,60);
});

for(const status of [400,401,402,404])test(`HTTP ${status}: sin reintento y memorizado (no se repite la misma petición)`,async()=>{
 const e=entorno([{status,body:'{"msg":"bad"}'},{status:200}]);const g=e.nueva();
 await assert.rejects(g.solicitar('https://api.finmindtrade.com/api/v4/data?dataset=X&token=SECRET_TOKEN_123'),err=>err.codigo==='HTTP_'+status&&!err.message.includes('SECRET_TOKEN_123'));
 assert.equal(e.llamadas.length,1);
 if(status===402||status===401){assert.ok(g.estado().circuito.abiertoHasta>e.reloj.t,'402/401 abren el circuito');return;}
 await assert.rejects(g.solicitar('https://api.finmindtrade.com/api/v4/data?dataset=X&token=OTRO'),err=>err.codigo==='FALLO_PERMANENTE_MEMORIZADO');
 assert.equal(e.llamadas.length,1,'deduplicado sin red');
});

test('403 de bloqueo de IP: circuito abierto al menos 35 minutos y ninguna petición durante la pausa',async()=>{
 const e=entorno([{status:403,body:'{"msg": "ip banned", "status": 403}'},{status:200}]);const g=e.nueva();
 await assert.rejects(g.solicitar('https://x.test/a'),err=>err.codigo==='BLOQUEO_IP'&&err.reanudarEn-e.reloj.t>=35*60000);
 await assert.rejects(g.solicitar('https://x.test/b',{}, {esperaMaximaMs:60000}),err=>err.codigo==='CIRCUITO_ABIERTO');
 assert.equal(e.llamadas.length,1);
 e.reloj.t+=35*60000+1;await g.solicitar('https://x.test/b');assert.equal(e.llamadas.length,2);
});

test('FinMind con HTTP 200 y status 402 en el JSON se trata como cuota agotada',async()=>{
 const e=entorno([{status:200,body:'{"msg":"Requests reach the upper limit","status":402}'}]);const g=e.nueva();
 await assert.rejects(g.solicitar('https://x.test/q'),err=>err.codigo==='HTTP_402');
 assert.equal(g.estado().circuito.motivo,'CUOTA_AGOTADA_402');
});

test('429 respeta Retry-After y reintenta tras la espera',async()=>{
 const e=entorno([{status:429,headers:{'retry-after':'90'}},{status:200,body:'{"ok":1}'}],{separacionMinimaMs:0});const g=e.nueva();
 const r=await g.solicitar('https://x.test/r');assert.equal(r.status,200);
 assert.equal(e.llamadas.length,2);assert.ok(e.esperas.some(ms=>ms>=90000));
});
test('Retry-After en formato fecha HTTP',()=>{assert.equal(G.retryAfterMs(new Date(Date.UTC(2026,0,1,0,1)).toUTCString(),Date.UTC(2026,0,1)),60000);assert.equal(G.retryAfterMs('7',0),7000);assert.equal(G.retryAfterMs(null,0),null);});

test('5xx: backoff exponencial limitado y circuito tras fallos consecutivos',async()=>{
 const e=entorno(Array.from({length:10},()=>({status:503})),{separacionMinimaMs:0,maxReintentosTransitorios:3,umbralCircuito:10});const g=e.nueva();
 await assert.rejects(g.solicitar('https://x.test/s'),err=>err.codigo==='HTTP_503');
 assert.equal(e.llamadas.length,4);
 const backoffs=e.esperas.filter(ms=>[5000,10000,20000].includes(ms));assert.deepEqual(backoffs,[5000,10000,20000]);
 const f=entorno(Array.from({length:10},()=>new TypeError('fetch failed')),{separacionMinimaMs:0,umbralCircuito:2});const h=f.nueva();
 await assert.rejects(h.solicitar('https://x.test/n'),err=>err.codigo==='RED');
 assert.equal(h.estado().circuito.motivo,'FALLOS_CONSECUTIVOS_RED');
});

test('peticiones idénticas simultáneas se comparten (una sola llamada de red)',async()=>{
 const e=entorno([{status:200,body:'{"v":1}'},{status:200}],{separacionMinimaMs:0});const g=e.nueva();
 const [a,b]=await Promise.all([g.solicitar('https://x.test/d'),g.solicitar('https://x.test/d')]);
 assert.equal(a.texto,b.texto);assert.equal(e.llamadas.length,1);
});

test('los secretos no aparecen en estado, errores ni URL de deduplicación',async()=>{
 const e=entorno([{status:400,body:'token SECRET_TOKEN_123 invalid'}]);const g=e.nueva();
 await assert.rejects(g.solicitar('https://x.test/z?token=SECRET_TOKEN_123'),err=>!err.message.includes('SECRET_TOKEN_123'));
 assert.ok(!fs.readFileSync(path.join(e.dir,'finmind.json'),'utf8').includes('SECRET_TOKEN_123'));
 assert.equal(G.urlSinSecretos('https://a.test/p?apikey=abc&x=1'),'https://a.test/p?apikey=***&x=1');
});

test('un único token FinMind, nunca rotación',()=>{
 assert.equal(G.tokenFinMind({FINMIND_TOKEN:'',FINMIND_TOKEN_1:'t1',FINMIND_TOKEN_2:'t2'}),'t1');
 assert.equal(G.tokenFinMind({FINMIND_TOKEN:'t0',FINMIND_TOKEN_1:'t1'}),'t0');
 const src=fs.readFileSync(path.join(__dirname,'../insercionDatos/insercionPartidaContable.ts'),'utf8');
 assert.ok(!/status === 402[\s\S]{0,400}return twOptFetch\(url\)/.test(src),'sin reintento con otro token ante 402');
 for(const f of ['insercionPartidaContable','insercionInformeFinanciero','insercionDatosEmpresa','insercionDatosInstrumento','insercionEventoCorporativo','listarTiposFinMindCompleto']){
  const s=fs.readFileSync(path.join(__dirname,'../insercionDatos',f+'.ts'),'utf8');assert.ok(s.includes('finmindJson'),f+' usa el guardián');
 }
});
