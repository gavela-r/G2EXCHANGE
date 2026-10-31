// Conectores J-Quants V2 y Eulerpool (sin red: fetch simulado sobre el guardián real).
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {GuardiaProveedor}=require('../dist/src/proveedores/guardiaHttp.js');
const C=require('../dist/src/proveedores/conectores.js');
const entorno={JQUANTS_API_KEY:'JQ_SECRET_KEY_1',EULERPOOL_API_KEY:'EU_SECRET_KEY_1'};
function guardia(politica,respuestas,llamadas){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'con-'));let t=Date.UTC(2026,9,31);
 return new GuardiaProveedor({...politica,separacionMinimaMs:0},dir,Object.values(entorno),{ahora:()=>t,dormir:async ms=>{t+=ms;},fetch:async(url,init)=>{llamadas.push({url,headers:init.headers});const r=respuestas.shift();return new Response(r.body,{status:r.status??200,headers:r.headers??{}});}});}

test('ISIN de Taiwán con dígito de control Luhn (TSMC, Hon Hai, MediaTek)',()=>{
 assert.equal(C.isinTaiwan('2330'),'TW0002330008');assert.equal(C.isinTaiwan('2317'),'TW0002317005');assert.equal(C.isinTaiwan('2454'),'TW0002454006');
 assert.throws(()=>C.isinTaiwan('23300'));
});

test('J-Quants: x-api-key, paginación y 403 fuera de plan sin reintento',async()=>{
 const llamadas=[],g=guardia(C.politicaJQuants(),[{body:JSON.stringify({data:[{Code:'72030'}],pagination_key:'k1'})},{body:JSON.stringify({data:[{Code:'86970'}]})},{status:403,body:'{"message":"This API is not available on your subscription."}'}],llamadas);
 const jq=new C.JQuants(entorno,undefined,g);
 const filas=await jq.resumenes({date:'2025-05-08'});assert.equal(filas.length,2);
 assert.equal(llamadas[0].headers['x-api-key'],'JQ_SECRET_KEY_1');assert.match(llamadas[1].url,/pagination_key=k1/);
 await assert.rejects(jq.get('/v2/fins/details',{code:'7203'}),e=>e.codigo==='HTTP_403'&&!e.message.includes('JQ_SECRET_KEY_1'));
 await assert.rejects(jq.get('/v2/fins/details',{code:'7203'}),e=>e.codigo==='FALLO_PERMANENTE_MEMORIZADO');
 assert.equal(llamadas.length,3);
});

test('J-Quants: sólo resúmenes anuales consolidados; vacío no es cero',()=>{
 const base={DocType:'FYFinancialStatements_Consolidated_IFRS',CurPerType:'FY',CurFYEn:'2025-03-31',Code:'72030',DiscDate:'2025-05-08',DiscNo:'1',Sales:'48036704000000',OP:'4795586000000',NP:'4765086000000',TA:'',CFO:'3696934000000',CashEq:'8982404000000'};
 const a=C.anualConsolidadoJQuants(base);assert.equal(a.norma,'IFRS');assert.equal(a.valores.INGRESOS,48036704000000);assert.ok(!('ACTIVOS_TOTALES' in a.valores));
 assert.equal(C.anualConsolidadoJQuants({...base,DocType:'2QFinancialStatements_Consolidated_IFRS',CurPerType:'2Q'}),null);
 assert.equal(C.anualConsolidadoJQuants({...base,DocType:'FYFinancialStatements_NonConsolidated_JP'}),null);
 assert.ok(!('Eq' in C.MAPA_JQUANTS),'純資産 (incluye minoritarios) no se compara con el patrimonio');
});

test('Eulerpool: Bearer, cabeceras de cuota y filas sin estimaciones ni nulos',async()=>{
 const llamadas=[],g=guardia(C.politicaEulerpool(),[{body:JSON.stringify([{period:'2024-12-31',revenue:2894307.699,ebit:null},{period:'2026-12-31e',revenue:1}]),headers:{'x-ratelimit-remaining':'99990','x-ratelimit-window':'month'}}],llamadas);
 const ep=new C.Eulerpool(entorno,undefined,g);const r=await ep.equity('incomestatement','TW0002330008');
 assert.equal(llamadas[0].headers.Authorization,'Bearer EU_SECRET_KEY_1');assert.equal(r.limite.restante,99990);
 const filas=C.filasEulerpool('incomestatement',r.datos);assert.deepEqual(filas,[{fin:'2024-12-31',codigo:'INGRESOS',importe:2894307.699e6}]);
 await assert.rejects(ep.equity('profile','../x'),e=>e.codigo==='IDENTIFICADOR_INVALIDO');
 assert.throws(()=>new C.Eulerpool({},undefined,g),e=>e.codigo==='CREDENCIAL_NO_CONFIGURADA');
});
