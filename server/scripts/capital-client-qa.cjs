// React real compilado, DOM de prueba en memoria y API real de desarrollo. No controla el navegador del usuario.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../..'),qa=path.join(root,'.verification/capital-qa/node_modules'),{pathToFileURL}=require('node:url');
(async()=>{
 const {JSDOM,VirtualConsole}=await import(pathToFileURL(path.join(qa,'jsdom/lib/api.js')).href);
 const vc=new VirtualConsole(),errors=[],requests=[];vc.on('jsdomError',e=>errors.push(e.message));
 const dom=new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>',{url:'http://127.0.0.1:3100',runScripts:'outside-only',pretendToBeVisual:true,virtualConsole:vc});
 const w=dom.window;w.AbortController=global.AbortController;w.AbortSignal=global.AbortSignal;
 w.fetch=async(url,options)=>{const u=new URL(url,w.location.href);if(u.origin!==w.location.origin)throw Error('QA sin acceso externo');const r=await fetch(u,options);requests.push({path:u.pathname,method:options?.method??'GET',status:r.status});return r;};
 const files=fs.readdirSync(path.join(root,'client/dist/assets')),script=files.find(f=>f.endsWith('.js'));vm.runInContext(fs.readFileSync(path.join(root,'client/dist/assets',script),'utf8'),dom.getInternalVMContext());
 const wait=async(fn)=>{const start=Date.now();while(!fn()){if(Date.now()-start>15000)throw Error('Tiempo de espera DOM agotado');await new Promise(r=>setTimeout(r,30));}};
 const select=(node,value)=>{assert.ok(node);node.value=value;node.dispatchEvent(new w.Event('change',{bubbles:true}));};
 const label=text=>[...w.document.querySelectorAll('label')].find(l=>l.textContent.includes(text));
 const button=text=>[...w.document.querySelectorAll('button')].find(b=>b.textContent.includes(text));
 try{
 await wait(()=>[...w.document.querySelectorAll('select option')].some(o=>o.value==='1'));
 select(label('Empresa').querySelector('select'),'1');
 await wait(()=>w.document.querySelector('.company-head h2')?.textContent==='NVIDIA CORP');
 select(label('Ejercicio disponible').querySelector('select'),'2025-01-26');
 await wait(()=>w.document.querySelector('.company-head h2')?.textContent==='NVIDIA CORP'&&w.document.querySelector('.metrics strong')?.textContent.startsWith('12 /'));
 assert.ok(w.document.body.textContent.includes('NO_ESTIMABLE'));
 assert.ok(button('Aprobar ajuste').disabled);
 button('Guardar evaluación versionada').click();
 await wait(()=>[...w.document.querySelectorAll('a')].some(a=>a.textContent==='Descargar Excel'));
 if(process.env.CAPITAL_CLIENT_QA_OUTPUT){
  const automatic=button('Calcular primas');assert.ok(automatic);automatic.click();
  await wait(()=>w.document.body.textContent.includes('AUTOMÁTICO: consultar estados'));
  assert.ok(requests.some(r=>r.path.endsWith('/automatic-premiums')&&r.status===201));
  assert.ok(w.document.body.textContent.includes('0,00'));
 }
 assert.equal(w.document.querySelectorAll('[role="alert"]').length,0);
 const result={at:new Date().toISOString(),test:'React production bundle + in-memory DOM + real development API',company:'NVIDIA CORP',period:'2025-01-26',checks:['búsqueda API real','selección empresa','selección periodo','12 indicadores validados','diferenciación NO_ESTIMABLE','aprobación bloqueada','guardado versionado por interfaz','enlaces de descarga','sin errores DOM'],requests,errors,visualBrowserReview:false};
 if(process.env.CAPITAL_CLIENT_QA_OUTPUT)result.checks.push('cálculo automático desde React','ceros operativos y NO_ESTIMABLE visibles');
 assert.deepEqual(errors,[]);const out=path.join(root,process.env.CAPITAL_CLIENT_QA_OUTPUT??'valuation_engine/research/coste_capital/fase3/evidencias');fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'cliente-dom.json'),JSON.stringify(result,null,2));fs.writeFileSync(path.join(out,'cliente-dom.html'),dom.serialize());console.log(JSON.stringify(result));
 }catch(e){console.error(JSON.stringify({requests,errors,body:w.document.body.textContent.slice(0,2400)}));throw e;}finally{w.close();}
})().catch(e=>{console.error(e.stack);process.exitCode=1});
