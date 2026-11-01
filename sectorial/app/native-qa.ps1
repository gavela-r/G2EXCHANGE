$ErrorActionPreference='Stop'
$spec=Get-Content -Raw -LiteralPath $env:G2_QA_SPEC | ConvertFrom-Json
$excel=$null
$book=$null
$checked=0
try {
 $before=(Get-FileHash -LiteralPath $spec.file -Algorithm SHA256).Hash.ToLowerInvariant()
 if($before -ne $spec.pathHash){throw 'Hash de entrada divergente'}
 $excel=New-Object -ComObject Excel.Application
 $excel.Visible=$false
 $excel.DisplayAlerts=$false
 $excel.AskToUpdateLinks=$false
 $excel.AutomationSecurity=3
 if($excel.Workbooks.Count -ne 0){throw 'Instancia Excel no aislada'}
 $book=$excel.Workbooks.Open($spec.file,0,$true)
 if(-not $book.ReadOnly){throw 'El libro no se abrió en solo lectura'}
 if($book.RepairMode){throw 'Excel indica reparación del archivo'}
 foreach($case in $spec.cases){
  $book.Worksheets.Item('S_Control').Range('B6').Value2=[double]$case.scenario
  $excel.CalculateFullRebuild()
  foreach($group in ($case.nodes | Group-Object sheet)){
   $last=($group.Group | Measure-Object row -Maximum).Maximum
   $grid=$book.Worksheets.Item($group.Name).Range('A1:Q'+$last).Value2
   foreach($node in $group.Group){
    $actual=$grid.GetValue([int]$node.row,[int]$node.col)
    if($node.value -is [string]){if($actual -cne $node.value){throw ('Paridad '+$node.id+': '+$actual+' / '+$node.value)}}
    else{if($null -eq $actual -or $actual -is [string] -or [math]::Abs([double]$actual-[double]$node.value) -gt 1e-8*[math]::Max([double]1,[math]::Abs([double]$node.value))){throw ('Paridad '+$node.id+': '+$actual+' / '+$node.value)}}
    $checked++
   }
  }
  $price=$book.Worksheets.Item('Proyeciones INDITEX').Range('M199').Value2
  if($case.price -is [string]){if($price -cne $case.price){throw 'Precio principal divergente'}}
  elseif([math]::Abs([double]$price-[double]$case.price) -gt 1e-8*[math]::Max([double]1,[math]::Abs([double]$case.price))){throw 'Precio principal divergente'}
 }
 if($spec.cases.Count -gt 0){
  $book.Worksheets.Item('S_Control').Range('B6').Value2=2.0
  # Synthetic rates only in this in-memory QA copy; no calibration is registered.
  $rates=@{rf=0.03;beta=1.0;erp=0.05;kd=0.04;weightEquity=0.8;tax=0.25}
  foreach($key in $rates.Keys){$pos=$spec.mutation.capitalInputs.$key;$book.Worksheets.Item($pos.sheet).Cells.Item([int]$pos.row,[int]$pos.col).Value2=[double]$rates[$key]}
  $excel.CalculateFullRebuild()
  $ke=$book.Worksheets.Item('S_Capital').Range('M8').Value2
  if([math]::Abs([double]$ke-0.08) -gt 1e-12){throw 'Ke no reacciona a las hipótesis'}
  $wacc=$book.Worksheets.Item('S_Capital').Range('M10').Value2
  if([math]::Abs([double]$wacc-0.07) -gt 1e-12){throw 'WACC no reacciona a los componentes'}
  foreach($key in $rates.Keys){$pos=$spec.mutation.capitalInputs.$key;$cell=$book.Worksheets.Item($pos.sheet).Cells.Item([int]$pos.row,[int]$pos.col);if($null -eq $pos.original){$cell.ClearContents()|Out-Null}else{$cell.Value2=[double]$pos.original}}
  $excel.CalculateFullRebuild()
  if($spec.status -eq 'BLOQUEADO' -and $book.Worksheets.Item('Proyeciones INDITEX').Range('M199').Value2 -cne 'NO_ESTIMABLE'){throw 'La edición manual ha saltado un bloqueo de datos'}
 }
 $broken=0
 foreach($sheet in $book.Worksheets){
  $formulas=$sheet.UsedRange.Formula
  if($formulas -is [array]){foreach($formula in $formulas){if($formula -is [string] -and $formula.StartsWith('=') -and $formula -match '#REF!'){$broken++}}}
 }
 if($broken){throw ('Referencias rotas: '+$broken)}
 [pscustomobject]@{status='VALIDADO';openedNormally=$true;repairMode=$false;readOnly=$true;cases=$spec.cases.Count;formulaChecks=$checked;brokenReferences=$broken;capitalMutation=($spec.cases.Count -gt 0);excelVersion=$excel.Version;nativeFinancialApproval=$false}|ConvertTo-Json -Compress
} finally {
 if($book){$book.Close($false)}
 if($excel){$excel.Quit()}
 $after=(Get-FileHash -LiteralPath $spec.file -Algorithm SHA256).Hash.ToLowerInvariant()
 if($after -ne $spec.pathHash){throw 'El archivo cambió durante QA de solo lectura'}
}
