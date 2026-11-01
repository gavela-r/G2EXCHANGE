const {test}=require('node:test'),assert=require('node:assert/strict');
const {calcularPrimasAutomaticas,primasConAprobados}=require('../dist-capital/server/src/capital/primas');
const {hash,base,data,method}=require('./fixtures/capitalPrimas.cjs');

test('Primas automáticas: ausencia de método produce dos ceros operativos y dos estimaciones nulas',()=>{const p=calcularPrimasAutomaticas(data(),[],base);assert.equal(p.provisionales,2);assert.equal(p.estimadas,0);for(const r of p.primas){assert.equal(r.ajusteOperativo,0);assert.equal(r.primaCalculada,null);assert.equal(r.estadoFinanciero,'NO_ESTIMABLE');}});
test('Primas automáticas: coeficiente hipotético positivo calcula diferencia, no percentil',()=>{const r=calcularPrimasAutomaticas(data(),[method()],base).primas[0];assert.equal(r.primaCalculada,.004);assert.equal(r.estadoFinanciero,'POSITIVO');assert.equal(r.ajusteOperativo,0);assert.equal(r.estadoAplicacion,'PENDIENTE_APROBACION');assert.ok(r.propuesta.evidence.includes('base:'+hash));});
test('Primas automáticas: cero estimado se distingue del cero provisional',()=>{const m=method();m.coeficientes.lambda=0;const p=calcularPrimasAutomaticas(data(),[m],base);assert.equal(p.primas[0].primaCalculada,0);assert.equal(p.primas[0].estadoFinanciero,'CERO');assert.equal(p.primas[1].primaCalculada,null);});
test('Primas automáticas: reducción sin prima de referencia se bloquea',()=>{const m=method();m.coeficientes.lambda=-.002;const r=calcularPrimasAutomaticas(data(),[m],base).primas[0];assert.equal(r.estadoFinanciero,'NO_ESTIMABLE');assert.match(r.motivo,/referencia/);assert.equal(r.ajusteOperativo,0);});
test('Primas automáticas: reducción hipotética conciliada, aprobación y ponderación de Ke',()=>{const m=method();m.coeficientes.lambda=-.002;const b={...base,primasReferencia:[{riesgo:'LIQUIDEZ_BURSATIL',componente:'KE',tasa:.02,evidencia:'HYPOTHETICAL_REFERENCE_LEDGER'}]};const p=calcularPrimasAutomaticas(data(),[m],b),r=p.primas[0];assert.equal(r.primaCalculada,-.004);const a={id:'HYPOTHETICAL_PROPOSAL',factor:m.factor,componente:'KE',tasa:{valor:r.primaCalculada,unidad:'FRACCION_ANUAL'},exposiciones:r.propuesta.exposures,incorporacion:'NO_INCORPORADO',metodo:m,decision:{estado:'APPROVED',actor:'HYPOTHETICAL_TEST_ONLY',fecha:'2026-10-29'},evidencia:r.evidencia,referencia:r.propuesta.reference};assert.equal(primasConAprobados(p,[a],b,data().fecha,'US').primas[0].ajusteOperativo,-.004);});
test('Primas automáticas: tamaño residual utiliza log capitalización conciliada y controles',()=>{const m=method('TAMANO_RESIDUAL'),r=calcularPrimasAutomaticas(data(),[m],base).primas[1];assert.equal(r.primaCalculada,.004);m.controles=m.controles.filter(c=>c!=='LIQUIDEZ');assert.equal(calcularPrimasAutomaticas(data(),[m],base).primas[1].estadoFinanciero,'NO_ESTIMABLE');});
for(const [name,mutate] of [
 ['método experimental',(d,m)=>m.estado='EXPERIMENTAL'],
 ['capitalización parcial',(d,m)=>{m.factor='TAMANO_RESIDUAL';d.capitalizacion.estado='CAPITALIZACION_PARCIAL';}],
 ['moneda distinta',(d,m)=>m.precioRiesgo.moneda='JPY'],
 ['sin Amihud',(d)=>{d.bursatil=[];}],
 ['sin precio de riesgo validado',(d,m)=>m.precioRiesgo.validacion.rentabilidadExigida=false],
 ['riesgo incorporado desconocido',(d,m)=>m.precioRiesgo.incorporacionPorEmpresa={}],
 ['información futura',(d,m)=>m.precioRiesgo.referencia.fecha='2027-01-01'],
 ['fuera del dominio',(d,m)=>m.precioRiesgo.dominio.max=6],
 ['sin clasificación',(d)=>d.empresa.clasificacionResuelta=false],
 ['identidad bloqueada',(d)=>d.bloqueo='TEST_ONLY'],
 ['sin fórmula aplicable',(d,m)=>delete m.precioRiesgo],
 ['importe estimado sin aprobación',(d)=>d.bursatil[0].ventanas[0].importeEstimado=true]
 ,['coeficiente mensual no anualizado',(d,m)=>m.precioRiesgo.unidadCoeficiente='TASA_MENSUAL']
 ,['exposición de otra fecha',(d)=>d.bursatil[0].ventanas[0].sesiones[0].fecha='2026-10-28']
])test('Primas automáticas rechazan '+name,()=>{const d=data(),m=method();mutate(d,m);const r=calcularPrimasAutomaticas(d,[m],base);assert.ok(r.primas.every(p=>p.primaCalculada===null));assert.ok(r.primas.every(p=>p.ajusteOperativo===0));});
test('Primas automáticas: dos métodos aplicables se bloquean sin selección explícita',()=>{const a=method(),b=method();b.id+='2';assert.match(calcularPrimasAutomaticas(data(),[a,b],base).primas[0].motivo,/Más de una/);});
test('Primas automáticas: exposición ya incorporada no recibe una segunda prima',()=>{const d=data();d.incorporaciones=[{riesgo:'LIQUIDEZ_BURSATIL',cobertura:'TOTAL'}];const r=calcularPrimasAutomaticas(d,[method()],base).primas[0];assert.equal(r.estadoFinanciero,'YA_INCORPORADO');assert.equal(r.ajusteOperativo,0);});
