param([ValidateSet('tc1','tc2','cz')][string]$Game='tc2',[switch]$CheckOnly)
$ErrorActionPreference='Stop'
$projectRoot=Split-Path -Parent $PSScriptRoot
$profilePath=Join-Path $projectRoot 'build/pcvr-profile'
$chromeCandidates=@("$env:ProgramFiles/Google/Chrome/Application/chrome.exe","${env:ProgramFiles(x86)}/Google/Chrome/Application/chrome.exe","$env:LOCALAPPDATA/Google/Chrome/Application/chrome.exe")
$chromePath=$chromeCandidates | Where-Object {Test-Path -LiteralPath $_} | Select-Object -First 1
if(!$chromePath){throw 'Google Chrome was not found.'}
$url="http://localhost:8094/?game=$Game"
$browserArguments=@('--force-high-performance-gpu',('--user-data-dir="{0}"' -f $profilePath),$url)
function Test-ArcadeServer {
    try {
        $response=Invoke-RestMethod 'http://127.0.0.1:8094/api/online' -TimeoutSec 5
        return $response.protocol -eq 'tc2-nmn2-ws-v1'
    } catch {return $false}
}
$ready=Test-ArcadeServer
if($CheckOnly){[PSCustomObject]@{Browser=$chromePath;Profile=$profilePath;Arguments=$browserArguments;Url=$url;ServerReady=$ready;GPU='High performance'};return}
if(!$ready){
    if(Get-NetTCPConnection -LocalPort 8094 -State Listen -ErrorAction SilentlyContinue){throw 'Port 8094 is occupied by a different or unresponsive server.'}
    & (Join-Path $PSScriptRoot 'start-server.ps1') -Port 8094
    if(!(Test-ArcadeServer)){throw 'The online web server could not start.'}
}
# Separate profile ensures the GPU flag is used even if normal Chrome is open.
# Keep the tested browser profile's arcade settings and saves between launches.
Start-Process -FilePath $chromePath -ArgumentList $browserArguments
Write-Output "PCVR arcade: $url"
Write-Output 'Connect Virtual Desktop, choose 120 Hz in its streaming settings, then Load game / Enter VR.'
