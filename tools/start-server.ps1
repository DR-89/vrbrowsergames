param([int]$Port=8094)
$ErrorActionPreference='Stop'
$projectRoot=Split-Path -Parent $PSScriptRoot
$nodePath=(Get-Command node.exe -ErrorAction Stop).Source
$lobbyPath=Join-Path $projectRoot 'build/native-tc2/upstream/server/target/release/nmn-server.exe'
if(!(Test-Path -LiteralPath $lobbyPath)){throw 'Build the pinned lobby server first; see deploy/README-DE.md.'}
if(!(Test-Path -LiteralPath (Join-Path $projectRoot 'server/node_modules/ws'))){throw 'Run npm ci --prefix server first.'}
$logDir=Join-Path $projectRoot 'build/qa'
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
if(Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue){throw "Port $Port is already occupied."}
$lobbyProcess=$null
if(!(Get-NetUDPEndpoint -LocalPort 27750 -ErrorAction SilentlyContinue)){
 $lobbyProcess=Start-Process -FilePath $lobbyPath -ArgumentList @('--bind','127.0.0.1','--port','27750','--name','WebXR','--max-per-ip','256','--max-session-min','180','--quiet') -WorkingDirectory $projectRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $logDir 'lobby.log') -RedirectStandardError (Join-Path $logDir 'lobby-errors.log')
}
$previousPort=$env:PORT
try{
 $env:PORT="$Port"
 $serverPath=Join-Path $projectRoot 'server/server.mjs'
 $serverProcess=Start-Process -FilePath $nodePath -ArgumentList @(('"{0}"' -f $serverPath)) -WorkingDirectory $projectRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $logDir 'local-server.log') -RedirectStandardError (Join-Path $logDir 'local-server-errors.log')
 for($attempt=0;$attempt -lt 40;$attempt++){
  try{if((Invoke-RestMethod "http://127.0.0.1:$Port/api/online" -TimeoutSec 2).protocol -eq 'tc2-nmn2-ws-v1'){Write-Output "WebXR + online: http://localhost:$Port/";return}}catch{}
  if($serverProcess.HasExited){break}
  Start-Sleep -Milliseconds 250
 }
 throw 'The web server did not become ready. Check build/qa/local-server-errors.log.'
}catch{
 if($serverProcess -and !$serverProcess.HasExited){$serverProcess.Kill()}
 if($lobbyProcess -and !$lobbyProcess.HasExited){$lobbyProcess.Kill()}
 throw
}finally{$env:PORT=$previousPort}
