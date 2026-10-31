# Evidencia visual: Excel nativo abre el libro en solo lectura, recalcula y exporta PNG de rangos. No guarda el libro.
# Uso: powershell -NoProfile -File tests\captura_excel.ps1 <xlsx> <carpeta_salida>
param([string]$File,[string]$Out)
$ErrorActionPreference='Stop'
New-Item -ItemType Directory -Force $Out | Out-Null
$before=(Get-FileHash -LiteralPath $File -Algorithm SHA256).Hash
$excel=New-Object -ComObject Excel.Application
$excel.Visible=$false;$excel.DisplayAlerts=$false;$excel.AutomationSecurity=3
$book=$null;$done=@()
try{
 $book=$excel.Workbooks.Open($File,0,$true)
 if($book.RepairMode){throw 'Excel indica reparación'}
 $excel.CalculateFullRebuild()
 $targets=@(@('Proyeciones INDITEX','B74:Q122'),@('Proyeciones INDITEX','B156:R202'),@('S_Control','A1:Q40'),@('S_Capital','A1:Q16'),@('S_Valoracion','A1:Q20'),@('S_Activos','A1:Q40'))
 foreach($t in $targets){
  $sheet=$null;try{$sheet=$book.Worksheets.Item($t[0])}catch{continue}
  $range=$sheet.Range($t[1])
  $range.CopyPicture(1,2)|Out-Null
  $chart=$sheet.ChartObjects().Add(0,0,[double]$range.Width,[double]$range.Height)
  $chart.Activate()|Out-Null;$chart.Chart.Paste()|Out-Null
  $png=Join-Path $Out (($t[0] -replace '[^A-Za-z0-9_]','_')+'_'+($t[1] -replace ':','-')+'.png')
  $chart.Chart.Export($png)|Out-Null;$chart.Delete()|Out-Null;$done+=$png
 }
}finally{
 if($book){$book.Close($false)}
 $excel.Quit()
 if((Get-FileHash -LiteralPath $File -Algorithm SHA256).Hash -ne $before){throw 'El libro cambió'}
}
$done|ConvertTo-Json
