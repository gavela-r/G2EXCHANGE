const {test}=require('node:test'),assert=require('node:assert/strict');
const {ultimaObservacionFred,calcularRatingSintetico}=require('../dist/insercionDatos/automatizacionRatingSintetico');
const pool=require('../dist/conexion/bd').default;
test('FRED: observations real, cero explícito, dato ausente no equivale a cero',async()=>{
 const fetchOriginal=global.fetch;
 try{global.fetch=async()=>({ok:true,json:async()=>({observations:[{date:'2026-10-01',value:'0'}]})});assert.deepEqual(await ultimaObservacionFred('TEST','SYNTHETIC_KEY'),{fecha:'2026-10-01',valor:0});
 global.fetch=async()=>({ok:true,json:async()=>({observations:[{date:'2026-10-01',value:'.'}]})});await assert.rejects(()=>ultimaObservacionFred('TEST','SYNTHETIC_KEY'),/no tiene observaciones/);
 }finally{global.fetch=fetchOriginal;}
});
test('Rating API: intereses cero permanece pendiente, perfil obligatorio; SQL coincide con esquema',async()=>{
 const response=()=>({code:0,body:null,status(n){this.code=n;return this;},json(v){this.body=v;return this;}});
 let res=response();await calcularRatingSintetico({body:{ebit:100,gastoIntereses:0,perfilEmpresa:'GRANDE_NO_FINANCIERA'}},res);assert.equal(res.code,422);
 res=response();await calcularRatingSintetico({body:{ebit:100,gastoIntereses:10}},res);assert.equal(res.code,400);
 const original=pool.query;try{pool.query=async(sql,args)=>{assert.match(sql,/conbertura_interes_min_exclusiva/);assert.equal(args[1],10);return [[{rating_estimado:'AAA',spread_credito_optimista:'1',spread_credito_base:'2',spread_credito_pesimista:'3'}]];};
 res=response();await calcularRatingSintetico({body:{coberturaIntereses:10,perfilEmpresa:'PEQUEÑA_RIESGOSA'}},res);assert.equal(res.code,200);assert.equal(res.body.ratingEstimado,'AAA');assert.equal(res.body.spreadsCredito.optimista,1);
 }finally{pool.query=original;}
});
test.after(()=>pool.end());
