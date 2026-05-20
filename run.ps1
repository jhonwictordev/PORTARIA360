param(
  [ValidateSet("start", "test")]
  [string]$Task = "start"
)

$bundledNode = "C:\Users\jhon\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
$nodeCommand = Get-Command node -ErrorAction SilentlyContinue

if ($nodeCommand) {
  & $nodeCommand.Source --run $Task
  exit $LASTEXITCODE
}

if (Test-Path $bundledNode) {
  & $bundledNode --run $Task
  exit $LASTEXITCODE
}

Write-Error "Nao foi possivel localizar o Node.js. Verifique o PATH ou o runtime empacotado."
exit 1
