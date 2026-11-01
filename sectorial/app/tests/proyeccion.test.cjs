// Motor de proyección adaptativa y derivaciones de componentes del adaptador.
const test=require('node:test'),assert=require('node:assert/strict'),P=require('../proyeccion.cjs'),A=require('../adapter.cjs'),AD=require('../adaptativo.cjs');
const s=(...v)=>v.map((x,i)=>({year:2022+i,value:x}));
test('no modifica los originales y conserva la estimación sin ajustar',()=>{
 const serie=s(200,120,124,128),copia=JSON.stringify(serie),a=P.analizarCrecimiento(serie,{referencia:0.04});
 assert.equal(JSON.stringify(serie),copia);assert.deepEqual(a.valores,[200,120,124,128]);assert.ok(a.sinAjustar.g0<0&&a.estimacionAjustada.g0>0);assert.equal(a.estimacion.metodo,'ATIPICO_SIN_EXTRAPOLACION');assert.equal(a.estimacion.g0,0);
});
test('año inicial extraordinario: POSIBLE, peso 0 y sin atribuir causa',()=>{
 const a=P.analizarCrecimiento(s(200,120,124,128),{referencia:0.04});
 assert.equal(a.atipicos[0].year,2022);assert.match(a.atipicos[0].tipo,/^POSIBLE_/);assert.equal(a.pesos[2022],0);assert.equal(a.patron,'SALTO_INICIAL_Y_ESTABILIDAD');assert.match(a.atipicos[0].motivo,/no se atribuye causa/);
});
test('extraordinario documentado sólo con fuente del analista',()=>{
 assert.match(P.analizarCrecimiento(s(100,150,104,108),{documentados:[{year:2023}]}).atipicos[0].tipo,/^POSIBLE/);
 assert.equal(P.analizarCrecimiento(s(100,150,104,108),{documentados:[{year:2023,fuente:'Informe anual 2023, nota 4'}]}).atipicos[0].tipo,'EXTRAORDINARIO_DOCUMENTADO');
});
test('un ejercicio: sin tendencia propia; dos: condicionado; hueco: sólo tramo consecutivo',()=>{
 const uno=P.analizarCrecimiento(s(100),{referencia:0.03});assert.equal(uno.estimacion.metodo,'SIN_TENDENCIA_PROPIA');assert.equal(uno.estimacion.g0,0.03);
 assert.equal(P.analizarCrecimiento(s(100)).estado,'SIN_REFERENCIA');
 const dos=P.analizarCrecimiento(s(100,120),{referencia:0.02});assert.equal(dos.estimacion.metodo,'CONDICIONADO_DOS_EJERCICIOS');assert.ok(dos.advertencias.includes('TENDENCIA_NO_ROBUSTA'));
 assert.deepEqual(P.analizarCrecimiento([{year:2022,value:100},{year:2024,value:120},{year:2025,value:125}]).ejercicios,[2024,2025]);
});
test('patrones: crecimiento sostenido, recuperación y volatilidad',()=>{
 assert.equal(P.analizarCrecimiento(s(100,110,121,133)).patron,'CRECIMIENTO_SOSTENIDO');
 assert.equal(P.analizarCrecimiento(s(100,80,95,110)).patron,'RECUPERACION');
 assert.equal(P.analizarCrecimiento(s(100,160,90,150)).patron,'ALTA_VOLATILIDAD');
});
test('trayectorias: reversión hacia el destino y escenarios ordenados',()=>{
 const t=P.trayectoriaCrecimiento(P.analizarCrecimiento(s(100,120,144,173)),{destino:0.025});
 assert.ok(t.central[0]>t.central[4]&&t.central[4]>0.025);for(let i=0;i<5;i++)assert.ok(t.conservador[i]<=t.central[i]&&t.central[i]<=t.optimista[i]);
 const r=P.trayectoriaRatio(P.analizarRatio(s(0.2,0.22,0.21,0.3),{minimo:0.03}),{minimo:0.01});assert.ok(r.central[0]<0.3&&r.central[4]<r.central[0]);
});
test('derivaciones: deuda por LongTermDebt + papel comercial, ausencias acreditadas y no presentado ≠ cero contable',()=>{
 const obs=(code,value,concept)=>({code,value,validation:'VALIDADO',norm:'US_GAAP',currency:'USD',basis:'consolidated',concept,recordId:Math.round(value)});
 const observations=[obs('DEUDA_LP_TOTAL',96662,'LongTermDebt'),obs('PAPEL_COMERCIAL',9967,'CommercialPaper'),obs('ARREND_OPERATIVO_TOTAL',11534,'OperatingLeaseLiability'),obs('ARREND_FINANCIERO_TOTAL',896,'FinanceLeaseLiability'),obs('PAS_CONTRACTUAL_TOTAL',12800,'ContractWithCustomerLiability')];
 const ausentes=new Set(['FAMILIA_ACT_CONTRACTUALES','EMPRESTITOS_CORTO_PLAZO']),parsed=[...ausentes].map((c,i)=>({id:i+1,outcome:'NOT_PRESENTED',concept_code:c}));
 const fields={shortDebt:{validation:'PENDIENTE'},longDebt:{validation:'PENDIENTE'},inventory:{validation:'PENDIENTE'}};
 A.derivarComponentes(fields,observations,ausentes,parsed);
 assert.equal(fields.debt.value,106629);assert.equal(fields.debt.validation,'VALIDADO');assert.match(fields.debt.derivation.rule,/DEUDA_LP/);
 assert.equal(fields.leaseDebt.value,12430);assert.equal(fields.contractLiabilities.value,12800);
 assert.equal(fields.contractAssets.validation,'NO_APLICABLE');assert.equal(fields.contractAssets.evidence.family,'FAMILIA_ACT_CONTRACTUALES');
 assert.equal(fields.inventory.validation,'PENDIENTE','sin evidencia NOT_PRESENTED el inventario no pasa a no aplicable');
 assert.equal(fields.taxPayable.validation,'PENDIENTE','sin componente ni ausencia acreditada queda pendiente, nunca cero');
});
test('derivaciones: definiciones de deuda incompatibles se bloquean',()=>{
 const obs=(code,value)=>({code,value,validation:'VALIDADO',norm:'US_GAAP',currency:'USD',basis:'consolidated',concept:code,recordId:value});
 const fields={shortDebt:{validation:'PENDIENTE'},longDebt:{validation:'PENDIENTE'}};
 A.derivarComponentes(fields,[obs('DEUDA_FINANCIERA_COMBINADA',100),obs('DEUDA_LP_TOTAL',150),obs('PAPEL_COMERCIAL',0)],new Set(),[]);
 assert.equal(fields.debt.validation,'CONFLICTIVO');
});
test('adaptativo: plantillas excluidas declaran la causa e impulsores reproducen la senda de ingresos',()=>{
 assert.ok(!AD.SOPORTADAS.has(13)&&/capital regulatorio/.test(AD.EXCLUIDAS[13]));
 const R=[90,110,115,120,126],yf=[0.9,1,1,1,1];
 for(const id of [1,3,4,5,10,11,12,16]){const d=AD.impulsoresIngresos(id,R,yf);assert.ok(d&&d.nota,'plantilla '+id);}
 const arr=AD.impulsoresIngresos(2,R,yf);assert.ok(arr.drivers.newArr.every(x=>x>=0));
});
