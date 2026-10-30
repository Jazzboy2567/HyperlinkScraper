# keepalive.ps1 - keep the HyperlinkScraper server running.
# Run on a schedule (e.g. every 30 min). If the server is already listening on
# its port it does nothing; if it's down it starts a fresh, detached instance.
# The started server keeps running after this script exits.

$ErrorActionPreference = 'SilentlyContinue'

$ProjectDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$Port       = 3000
$LogFile    = Join-Path $ProjectDir 'server.log'
$KeepLog    = Join-Path $ProjectDir 'keepalive.log'

function Test-Port([int]$p) {
    try {
        $client = New-Object System.Net.Sockets.TcpClient
        $client.Connect('127.0.0.1', $p)
        $client.Close()
        return $true
    } catch {
        return $false
    }
}

$stamp = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'

if (Test-Port $Port) {
    Add-Content -Path $KeepLog -Value "$stamp  up - port $Port responding, nothing to do"
    exit 0
}

# Find node (prefer PATH; fall back to a common install location).
$node = (Get-Command node -ErrorAction SilentlyContinue).Source
if (-not $node) { $node = "$env:ProgramFiles\nodejs\node.exe" }

if (-not (Test-Path $node)) {
    Add-Content -Path $KeepLog -Value "$stamp  ERROR - node not found; cannot start server"
    exit 1
}

Add-Content -Path $KeepLog -Value "$stamp  down - starting server via $node"

Start-Process -FilePath $node `
    -ArgumentList 'scraper.js' `
    -WorkingDirectory $ProjectDir `
    -WindowStyle Hidden `
    -RedirectStandardOutput $LogFile `
    -RedirectStandardError (Join-Path $ProjectDir 'server.err.log')
