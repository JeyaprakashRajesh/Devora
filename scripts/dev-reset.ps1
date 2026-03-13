$ErrorActionPreference = 'SilentlyContinue'

Write-Output '[dev-reset] Stopping local service listeners on common dev ports...'
$ports = @(3000, 4000, 4001, 4002, 4003, 4004, 4005, 4006, 4007, 5173)

foreach ($port in $ports) {
  $conns = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
  if ($null -eq $conns) {
    continue
  }

  $pids = $conns | Select-Object -ExpandProperty OwningProcess -Unique
  foreach ($procId in $pids) {
    try {
      Stop-Process -Id $procId -Force -ErrorAction Stop
      Write-Output "[dev-reset] Stopped PID $procId on port $port"
    } catch {
      Write-Output "[dev-reset] Failed to stop PID $procId on port $port"
    }
  }
}

Write-Output '[dev-reset] Bringing down docker compose stack...'
docker compose -f infra/compose/dev.yml down --remove-orphans | Out-Null

Write-Output '[dev-reset] Stopping remaining Devora node processes...'
$workspacePath = (Get-Location).Path
$nodeProcesses = Get-CimInstance Win32_Process -Filter "Name = 'node.exe'"
foreach ($proc in $nodeProcesses) {
  if ($proc.CommandLine -and $proc.CommandLine -like "*$workspacePath*") {
    try {
      Stop-Process -Id $proc.ProcessId -Force -ErrorAction Stop
      Write-Output "[dev-reset] Stopped node PID $($proc.ProcessId)"
    } catch {
      Write-Output "[dev-reset] Failed to stop node PID $($proc.ProcessId)"
    }
  }
}

Write-Output '[dev-reset] Done.'
