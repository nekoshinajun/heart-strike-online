$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
$RuntimeRoot = Join-Path $Root '.runtime'
$NodeExe = Join-Path $RuntimeRoot 'node.exe'

function Write-Title($text) { Write-Host "`n=== $text ===" -ForegroundColor Cyan }

Write-Title 'HEART STRIKE ONLINE'

if (-not (Test-Path $NodeExe)) {
  Write-Host '初回のみ: Node.js のポータブル実行環境を公式配布元から取得します。' -ForegroundColor Yellow
  New-Item -ItemType Directory -Force -Path $RuntimeRoot | Out-Null
  $releases = Invoke-RestMethod 'https://nodejs.org/dist/index.json'
  $release = $releases | Where-Object { $_.lts -and ($_.files -contains 'win-x64-zip') } | Select-Object -First 1
  if (-not $release) { throw 'Node.js LTS の Windows x64 ZIP を取得できませんでした。' }
  $ver = $release.version
  $zip = Join-Path $env:TEMP "heart-strike-node-$ver.zip"
  $url = "https://nodejs.org/dist/$ver/node-$ver-win-x64.zip"
  Write-Host "Downloading $ver ..."
  Invoke-WebRequest -UseBasicParsing $url -OutFile $zip
  $tmp = Join-Path $env:TEMP "heart-strike-node-$([guid]::NewGuid().ToString('N'))"
  Expand-Archive -Path $zip -DestinationPath $tmp -Force
  $folder = Get-ChildItem $tmp -Directory | Select-Object -First 1
  Copy-Item (Join-Path $folder.FullName '*') $RuntimeRoot -Recurse -Force
  Remove-Item $zip -Force -ErrorAction SilentlyContinue
  Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue
}

$port = 8787
$localUrl = "http://localhost:$port/online.html?online=1"
$lanIp = $null
try {
  $lanIp = Get-NetIPAddress -AddressFamily IPv4 | Where-Object {
    $_.IPAddress -notmatch '^127\.' -and $_.IPAddress -notmatch '^169\.254\.' -and $_.PrefixOrigin -ne 'WellKnown'
  } | Sort-Object InterfaceMetric | Select-Object -First 1 -ExpandProperty IPAddress
} catch {}
$lanUrl = if ($lanIp) { "http://${lanIp}:$port/online.html?online=1" } else { $null }

# Already running? Reuse it.
$running = $false
try { $h = Invoke-RestMethod "http://localhost:$port/health" -TimeoutSec 1; if ($h.ok) { $running = $true } } catch {}

if (-not $running) {
  Write-Host 'オンラインサーバーを起動しています...'
  $proc = Start-Process -FilePath $NodeExe -ArgumentList 'server.js' -WorkingDirectory $Root -PassThru -WindowStyle Hidden
  $ok = $false
  for ($i=0; $i -lt 40; $i++) {
    Start-Sleep -Milliseconds 250
    try { $h = Invoke-RestMethod "http://localhost:$port/health" -TimeoutSec 1; if ($h.ok) { $ok=$true; break } } catch {}
    if ($proc.HasExited) { break }
  }
  if (-not $ok) { throw 'サーバーを起動できませんでした。ポート8787が使用中でないか確認してください。' }
}

Write-Host ''
Write-Host 'このPC:' -ForegroundColor Green
Write-Host "  $localUrl"
if ($lanUrl) {
  Write-Host '同じWi-Fiのスマホ:' -ForegroundColor Green
  Write-Host "  $lanUrl"
  Write-Host '※ 初回にWindowsファイアウォールが表示されたら「プライベート ネットワーク」を許可してください。' -ForegroundColor Yellow
}
Write-Host ''
Write-Host 'ブラウザを開きます。2台目以降は上の「同じWi-Fiのスマホ」URLを開いてください。'
Start-Process $localUrl
Write-Host ''
Write-Host 'このウィンドウは閉じてもサーバーは動作します。停止するときは「オンライン停止.bat」を実行してください。'
Read-Host 'Enterでこの画面を閉じる'
