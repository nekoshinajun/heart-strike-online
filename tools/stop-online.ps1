$ErrorActionPreference = 'SilentlyContinue'
$Root = Split-Path -Parent $PSScriptRoot
$NodeExe = Join-Path $Root '.runtime\node.exe'
$procs = Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'node.exe' -and $_.ExecutablePath -eq $NodeExe -and $_.CommandLine -match 'server\.js' }
foreach ($p in $procs) { Stop-Process -Id $p.ProcessId -Force }
Write-Host 'HEART STRIKE Online server stopped.'
Start-Sleep -Seconds 1
