# restart-web.ps1 — detached restart of the dsh "web" profile server.
# Launched from a danger-full-access context so the new `dsh web` process can
# write ~/.dsh/profiles/web/cordis.yml and bind 127.0.0.1:3080.
$ErrorActionPreference = 'Continue'
$workspace = Split-Path -Parent $PSScriptRoot
$log       = Join-Path $workspace 'restart-web.log'
$outLog    = Join-Path $workspace 'restart-web.out.log'
$errLog    = Join-Path $workspace 'restart-web.err.log'
$dshCmd    = 'dsh.cmd'  # assumes dsh CLI is on PATH

function Log([string]$m) {
    $line = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') $m"
    Add-Content -LiteralPath $log -Value $line
}

Log '=== restart-web.ps1 started ==='

# Give the agent's final turn time to flush before we tear down its host.
Start-Sleep -Seconds 8

# 1. Kill whatever is listening on 3080.
$listen = netstat -ano | Select-String ':3080\s' | Select-String 'LISTENING'
Log ("netstat LISTENING: " + ((($listen -join ' | ') -replace '\s+', ' ')))
$pids = $listen | ForEach-Object { ($_ -split '\s+')[-1] } | Where-Object { $_ -match '^\d+$' } | Sort-Object -Unique
if ($pids) {
    foreach ($p in $pids) {
        Log "killing PID $p"
        taskkill /PID $p /F 2>&1 | ForEach-Object { Log $_ }
    }
} else {
    Log 'no listener on 3080 (already down?)'
}
Start-Sleep -Seconds 2

# 2. Drop session-specific env that belongs to the old agent session.
Remove-Item Env:DSH_SESSION_ID   -ErrorAction SilentlyContinue
Remove-Item Env:DSH_SESSION_JSONL -ErrorAction SilentlyContinue
Remove-Item Env:DSH_WEB_URL      -ErrorAction SilentlyContinue
$env:DSH_HOME = Join-Path $env:USERPROFILE '.dsh'

# 3. Start dsh web detached (cmd wrapper runs the .cmd shim; plain file
#    redirection, no named pipes).
Log "starting dsh web from $workspace"
$cmd = '"' + $dshCmd + '" web >> "' + $outLog + '" 2>> "' + $errLog + '"'
$proc = Start-Process -FilePath 'cmd.exe' -ArgumentList @('/c', $cmd) -WorkingDirectory $workspace -WindowStyle Hidden -PassThru
Log ("launched cmd pid=" + $proc.Id)

# 4. Poll for the port to come back.
$ok = $false
for ($i = 1; $i -le 40; $i++) {
    Start-Sleep -Seconds 1
    $r = netstat -ano | Select-String ':3080\s' | Select-String 'LISTENING'
    if ($r) {
        Log ("port 3080 LISTENING after ${i}s: " + ((($r -join ' | ') -replace '\s+', ' ')))
        $ok = $true
        break
    }
}
if ($ok) { Log 'RESTART OK' } else { Log 'RESTART FAILED: port 3080 did not come up within 40s' }
Log '=== restart-web.ps1 finished ==='
