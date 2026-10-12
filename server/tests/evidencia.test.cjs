const {test}=require('node:test'),assert=require('node:assert/strict');
const {clasificarTaiwan,perfilPorCapitalizacion,clasificacionVigente}=require('../dist/src/valoracion/evidencia');
test('Fuente TW: industria específica, categorías contradictorias y financieras amplias',()=>{
 assert.equal(clasificarTaiwan(['半導體業','電子工業']).sectorId,19);
 assert.equal(clasificarTaiwan(['半導體業','食品工業']).status,'PENDING');
 for(const category of ['金融保險','生技醫療業','其他','ETF'])assert.equal(clasificarTaiwan([category]).status,'PENDING');
});
test('Perfil rating: umbral documentado USD; no fabricar FX ni tamaños',()=>{
 assert.equal(perfilPorCapitalizacion('US','USD','FCFF',100,60e6).profile,'GRANDE_NO_FINANCIERA');
 assert.equal(perfilPorCapitalizacion('US','USD','FCFF',100,40e6).profile,'PEQUEÑA_RIESGOSA');
 for(const args of [['JP','JPY','FCFF',100,60e6],['US','USD','FCFF',100,50e6],['US','USD','FCFF',NaN,60e6]])assert.equal(perfilPorCapitalizacion(...args),undefined);
 assert.equal(perfilPorCapitalizacion('US','USD','BANK',100,60e6).profile,'FINANCIERA');
});
test('Clasificación: último dictamen pendiente revoca uso del anterior; no ocultar errores DB',async()=>{
 assert.equal(await clasificacionVigente({query:async()=>[[{status:'PENDING',confidence:'HIGH'}]]},1,'2026-10-12'),undefined);
 assert.equal(await clasificacionVigente({query:async()=>{throw Object.assign(Error(),{code:'ER_NO_SUCH_TABLE'});}},1,'2026-10-12'),undefined);
 await assert.rejects(()=>clasificacionVigente({query:async()=>{throw Object.assign(Error('offline'),{code:'ECONNRESET'});}},1,'2026-10-12'),/offline/);
});
