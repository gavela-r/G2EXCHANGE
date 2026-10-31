// Isolated serialization bisection. Never a financial deliverable.
import fs from'node:fs/promises';import path from'node:path';import{Workbook,FileBlob,SpreadsheetFile}from'@oai/artifact-tool';
const root=path.resolve('integracion_v02'),records=JSON.parse(await fs.readFile(path.join(root,'evidencias/xlsx_estructura_comparada.json'),'utf8')),m=records[1],source=await SpreadsheetFile.importXlsx(await FileBlob.load(m.file));
for(const mode of (process.argv.includes('--sheets')?source.worksheets.items.slice(19).map(s=>s.name):['reference','graph'])){
 const wb=Workbook.create();wb.colorScheme={name:source.colorScheme.name,themeColors:source.colorScheme.themeColors};
 const names=source.worksheets.items.map(s=>s.name);for(const name of names)wb.worksheets.add(name);
 for(let i=0;i<names.length;i++){if(mode.startsWith('S_')?names[i]!==mode:(mode==='reference')!==(i<19))continue;const row=Math.max(...source.worksheets.getItem(names[i]).getUsedRange().address.match(/\d+/g).map(Number));const to=wb.worksheets.getItem(names[i]);to.getRange('A1:AJ'+row).copyFrom(source.worksheets.getItem(names[i]).getRange('A1:AJ'+row),'all');}
 wb.recalculate();await(await SpreadsheetFile.exportXlsx(wb)).save(path.join(root,'evidencias/QA_'+mode+'.xlsx'));console.log(mode);
}
