// Conservación de la presentación Inditex: compara por OOXML la hoja principal del libro exportado con el maestro original
// (combinaciones, anchos de columna, filas ocultas, paneles, estilos de celdas de rótulo). Sólo lectura.
// Uso: node tests/presentacion_ooxml.cjs <carpeta_xlsx> [salida.json] [carpeta_maestros_inditex]
const fs=require('node:fs'),path=require('node:path'),{createRequire}=require('node:module');
const req=createRequire(path.join(require('../env.cjs').project,'server/package.json')),AdmZip=req('adm-zip'),cheerio=req('cheerio');
const dir=path.resolve(process.argv[2]??'qa_api_final'),out=process.argv[3],mastersDir=path.resolve(process.argv[4]??path.join(__dirname,'../../../originales'));
function sheet(file,name){const zip=new AdmZip(file),x=n=>cheerio.load(zip.readAsText(n),{xmlMode:true}),book=x('xl/workbook.xml'),rels=x('xl/_rels/workbook.xml.rels');
 const el=(d,n)=>d(d('*').toArray().filter(e=>e.name?.split(':').at(-1)===n));let rid;el(book,'sheet').each((_,e)=>{if(e.attribs.name===name)rid=e.attribs['r:id'];});if(!rid)return null;
 let target;el(rels,'Relationship').each((_,e)=>{if(e.attribs.Id===rid)target=e.attribs.Target;});const s=x(target.startsWith('/')?target.slice(1):'xl/'+target);
 const labels={};el(s,'c').each((_,c)=>{const r=c.attribs.r;if(/^B\d+$/.test(r))labels[r]=c.attribs.s??null;});
 return{merges:el(s,'mergeCell').toArray().map(m=>m.attribs.ref).sort(),cols:el(s,'col').toArray().map(c=>[c.attribs.min,c.attribs.max,Number(c.attribs.width).toFixed(2),c.attribs.hidden??'0'].join(':')),hiddenRows:el(s,'row').toArray().filter(r=>r.attribs.hidden==='1').map(r=>r.attribs.r),pane:el(s,'pane').toArray()[0]?.attribs??{},gridLines:el(s,'sheetView').attr('showGridLines')??'1',labelCells:Object.keys(labels).length};}
const masters=fs.readdirSync(mastersDir).filter(f=>f.endsWith('.xlsx'));
const rows=[];for(const f of fs.readdirSync(dir).filter(f=>/^QA_SECTOR_\d\d\.xlsx$/.test(f)).sort()){const code=f.slice(10,12),master=masters.find(m=>m.startsWith('G2EXCHANGE_'+code));
 const a=sheet(path.join(mastersDir,master),'Proyeciones INDITEX'),b=sheet(path.join(dir,f),'Proyeciones INDITEX');
 const same=k=>JSON.stringify(a[k])===JSON.stringify(b[k]);
 rows.push({sector:code,master,mergesEqual:same('merges'),merges:[a.merges.length,b.merges.length],colsEqual:same('cols'),hiddenRowsEqual:same('hiddenRows'),paneEqual:same('pane'),gridLines:[a.gridLines,b.gridLines],labelCells:[a.labelCells,b.labelCells],missingMerges:a.merges.filter(m=>!b.merges.includes(m)).slice(0,5),colDiff:a.cols.filter(c=>!b.cols.includes(c)).slice(0,5)});}
const result={at:new Date().toISOString(),dir:path.relative(process.cwd(),dir),rows};if(out)fs.writeFileSync(out,JSON.stringify(result,null,2));
for(const r of rows)console.log(r.sector,'merges',r.mergesEqual,r.merges.join('/'),'cols',r.colsEqual,'hidden',r.hiddenRowsEqual,'pane',r.paneEqual,'grid',r.gridLines.join('/'),'labels',r.labelCells.join('/'),r.missingMerges.join(' '),r.colDiff.join(' '));
