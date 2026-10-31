// Un código bursátil que coincide entre países (2330 en Tokio y en Taiwán) no puede mezclar empresas.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {normalizarNombreMercado}=require('../dist/src/pcv/mercados.js');
test('«TSE» se resuelve según el país',()=>{
 assert.equal(normalizarNombreMercado('TSE','TW'),'TAIWAN STOCK EXCHANGE');
 assert.equal(normalizarNombreMercado('tse','JP'),'TOKYO STOCK EXCHANGE');
 assert.equal(normalizarNombreMercado('TSE','US'),'','fuera de JP/TW no se adivina');
 assert.equal(normalizarNombreMercado('TWSE','TW'),'TAIWAN STOCK EXCHANGE');
 assert.equal(normalizarNombreMercado('NASDAQ','US'),'NASDAQ STOCK MARKET');
});
test('los cargadores exigen el país de la empresa',()=>{
 const inst=fs.readFileSync(path.join(__dirname,'../insercionDatos/insercionDatosInstrumento.ts'),'utf8');
 assert.match(inst,/normalizarNombreMercado\(\s*item\.mercado_nombre,\s*carga\.pais\s*\)/);
 assert.match(inst,/paisDeEmpresa\.get\(Number\(existente\.empresa_id\)\) === Number\(paisIdBD\)/);
 const inf=fs.readFileSync(path.join(__dirname,'../insercionDatos/insercionInformeFinanciero.ts'),'utf8');
 assert.match(inf,/p\.codigo_iso = 'JP'/);assert.match(inf,/Tickers ambiguos descartados/);
});
