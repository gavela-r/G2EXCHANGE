import fs from'node:fs/promises';import{SpreadsheetFile,FileBlob}from'@oai/artifact-tool';
const file='integracion_v02/evidencias/QA_S_Modelo.xlsx',wb=await SpreadsheetFile.importXlsx(await FileBlob.load(file)),sh=wb.worksheets.getItem('S_Modelo'),r=sh.getUsedRange(),matrix=r.formulas;let fixes=0;
for(const row of matrix)for(let i=0;i<row.length;i++)if(typeof row[i]==='string'&&row[i].includes('SUM()')){row[i]=row[i].replaceAll('SUM()','SUM(0)');fixes++;}
r.formulas=matrix;wb.recalculate();await(await SpreadsheetFile.exportXlsx(wb)).save('integracion_v02/evidencias/QA_S_Modelo_fixed.xlsx');console.log(JSON.stringify({fixes}));
