$ErrorActionPreference = 'Stop'

function Ensure-KubeContext {
  $context = ''
  try {
    $context = (kubectl config current-context 2>$null).Trim()
  } catch {
    $context = ''
  }

  $clusterReachable = $false
  if ($context) {
    try {
      kubectl cluster-info | Out-Null
      $clusterReachable = $true
    } catch {
      $clusterReachable = $false
    }
  }

  if ($clusterReachable) {
    Write-Output "[dev-up] Kubernetes context '$context' is healthy."
    return
  }

  Write-Output '[dev-up] Kubernetes context is missing or unreachable. Preparing kind cluster...'

  $toolsDir = Join-Path $PWD '.tools'
  if (-not (Test-Path $toolsDir)) {
    New-Item -ItemType Directory -Force -Path $toolsDir | Out-Null
  }

  $kindPath = Join-Path $toolsDir 'kind.exe'
  if (-not (Test-Path $kindPath)) {
    Write-Output '[dev-up] Downloading kind binary...'
    Invoke-WebRequest -UseBasicParsing -Uri 'https://kind.sigs.k8s.io/dl/v0.24.0/kind-windows-amd64' -OutFile $kindPath
  }

  $clusters = & $kindPath get clusters 2>$null
  if (-not ($clusters -match '^devora$')) {
    Write-Output '[dev-up] Creating kind cluster: devora'
    & $kindPath create cluster --name devora --wait 120s
  }

  kubectl config use-context kind-devora | Out-Null
  kubectl cluster-info | Out-Null
  Write-Output "[dev-up] Kubernetes context 'kind-devora' is ready."
}

Write-Output '[dev-up] Checking Docker daemon...'
docker info | Out-Null

Ensure-KubeContext

Write-Output '[dev-up] Labeling cluster nodes for sandbox scheduling...'
kubectl label nodes --all devora.io/role=sandbox --overwrite | Out-Null

Write-Output '[dev-up] Ensuring local workspace image is available...'
$workspaceImage = 'devora/workspace:latest'
$workspaceImageExists = $true
docker image inspect $workspaceImage | Out-Null
if ($LASTEXITCODE -ne 0) {
  $workspaceImageExists = $false
}

if (-not $workspaceImageExists) {
  Write-Output '[dev-up] Building workspace image...'
  npm run build:workspace-image
}

$kindPath = Join-Path (Join-Path $PWD '.tools') 'kind.exe'
if (Test-Path $kindPath) {
  Write-Output '[dev-up] Loading workspace image into kind cluster...'
  & $kindPath load docker-image $workspaceImage --name devora | Out-Null
}

Write-Output '[dev-up] Starting infrastructure containers...'
docker compose -f infra/compose/dev.yml up -d | Out-Null

Write-Output '[dev-up] Running DB migrations...'
npm run db:migrate

if (-not $env:DEVORA_USER_ID) {
  $env:DEVORA_USER_ID = 'dev-user-local'
}
if (-not $env:DEVORA_ORG_ID) {
  $env:DEVORA_ORG_ID = 'dev-org-local'
}
if (-not $env:DEVORA_WORKSPACE_ID) {
  $env:DEVORA_WORKSPACE_ID = 'dev-workspace-local'
}

Write-Output '[dev-up] Starting all services in dev mode...'
npm run dev -- --filter=!@devora/workspace-agent
